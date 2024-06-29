import { d } from "@/lib/drizzle.js";
import { FetchError, ResponseOkError } from "@/lib/errors.js";
import * as inferenceNodeApi from "@/lib/inferenceNodeApi.js";
import { konsole } from "@/lib/konsole.js";
import { redis } from "@/lib/redis.js";
import { timeoutSignal, unreachable } from "@/lib/utils.js";
import { v } from "@/lib/valibot.js";
import bodyParser from "body-parser";
import cors from "cors";
import { and, eq, isNull } from "drizzle-orm";
import { toMilliseconds } from "duration-fns";
import { Router } from "express";
import pRetry from "p-retry";
import {
  InferenceNodeSchema,
  inferenceNodeKey,
} from "../inferenceNodes/common.js";
import { GPT_SESSION_ID_SCHEMA } from "./_common.js";

const RequestBodySchema = v.object({
  prompt: v.string(),
});

const ProgressSchema = v.object({
  type: v.literal("progress"),
  progress: v.number(),
});

const EpilogueSchema = v.object({
  type: v.literal("epilogue"),
  decodeId: v.string(),
  duration: v.number(),
  contextLength: v.number(),
});

/**
 * Decode a prompt with the GPT session.
 */
export default Router()
  .use(cors())
  .use(bodyParser.json())
  .post("/gpts/:gptSessionId/decode", async (req, res, next) => {
    const gptSessionId = v.safeParse(
      GPT_SESSION_ID_SCHEMA,
      req.params.gptSessionId,
    );

    if (!gptSessionId.success) {
      return res.status(400).send("Invalid GPT session ID");
    }

    const gptSession = await d.db.query.gptSessions.findFirst({
      where: and(
        eq(d.gptSessions.id, gptSessionId.output),
        isNull(d.gptSessions.deletedAt),
      ),
    });

    if (!gptSession) {
      return res.status(404).send("GPT session not found");
    }

    const body = v.safeParse(RequestBodySchema, req.body);
    if (!body.success) {
      konsole.warn(
        "Invalid request body to /gpts/decode",
        v.flatten(body.issues),
      );

      return res.status(400).send("Invalid request body");
    }

    const inferenceNode = await redis
      .get(inferenceNodeKey(gptSession.inferenceNodeId))
      .then((x) =>
        x ? v.parse(InferenceNodeSchema, JSON.parse(x)) : undefined,
      );

    if (!inferenceNode) {
      konsole.warn("Inference node is dead", gptSession);
      return res.status(410).send("Inference node is dead");
    }

    const inferenceNodeResult = await pRetry(
      async () => {
        for await (const chunk of inferenceNodeApi.decode(
          inferenceNode.baseUrl,
          gptSession.id,
          { prompt: body.output.prompt },
          { abortSignal: timeoutSignal(toMilliseconds({ minutes: 2 })) },
        )) {
          switch (chunk.type) {
            case "Progress":
              res.write(
                JSON.stringify({
                  type: "progress",
                  progress: chunk.progress,
                } satisfies v.InferOutput<typeof ProgressSchema>) + "\n",
              );

              break;
            case "Epilogue":
              return chunk;
            default:
              throw unreachable(chunk);
          }
        }

        throw new Error("Inference node /decode did not return an epilogue");
      },
      {
        retries: 2,
        onFailedAttempt: (error) => {
          if (error instanceof FetchError || error instanceof ResponseOkError) {
            konsole.warn(
              `Inference node /decode call error (${error.retriesLeft} retries left)`,
              error,
            );
          } else {
            throw error;
          }
        },
      },
    );

    const gptDecoding = (
      await d.db
        .insert(d.gptDecodings)
        .values({
          sessionId: gptSession.id,
          prompt: body.output.prompt,
          decodingDuration: inferenceNodeResult.duration,
        })
        .returning({
          id: d.gptDecodings.id,
        })
    )[0];

    res.write(
      JSON.stringify({
        type: "epilogue",
        decodeId: gptDecoding.id,
        duration: inferenceNodeResult.duration,
        contextLength: inferenceNodeResult.contextLength,
      } satisfies v.InferOutput<typeof EpilogueSchema>) + "\n",
    );

    res.end();
  });

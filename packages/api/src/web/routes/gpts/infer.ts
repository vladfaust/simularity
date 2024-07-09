import { d } from "@/lib/drizzle.js";
import { FetchError, ResponseOkError } from "@/lib/errors.js";
import * as inferenceNodeApi from "@/lib/inferenceNodeApi.js";
import { OptionsSchema as InferenceOptionsSchema } from "@/lib/inferenceNodeApi/infer.js";
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
  prompt: v.nullable(v.string()),
  nEval: v.number(),
  options: InferenceOptionsSchema,
});

const ErrorChunkSchema = v.object({
  type: v.literal("error"),
  error: v.string(),
});

const DecodeProgressChunkSchema = v.object({
  type: v.literal("decodeProgress"),
  progress: v.number(),
});

const InferenceChunkSchema = v.object({
  type: v.literal("inference"),
  content: v.string(),
});

const EpilogueChunkSchema = v.object({
  type: v.literal("epilogue"),
  inferenceId: v.string(),
  duration: v.number(),
  contextLength: v.number(),
});

/**
 * Perform an inference with the GPT session.
 */
export default Router()
  .use(cors())
  .use(bodyParser.json())
  .post("/gpts/:gptSessionId/infer", async (req, res, next) => {
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
        "Invalid request body to /gpts/infer",
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

    let result = "";

    const inferenceNodeResponse = await pRetry(
      async () => {
        for await (const chunk of inferenceNodeApi.infer(
          inferenceNode.baseUrl,
          gptSession.inferenceNodeSessionId,
          {
            prompt: body.output.prompt,
            nEval: body.output.nEval,
            options: body.output.options,
          },
          { abortSignal: timeoutSignal(toMilliseconds({ minutes: 5 })) },
        )) {
          switch (chunk.type) {
            case "Error":
              res.write(
                JSON.stringify({
                  type: "error",
                  error: chunk.error,
                } satisfies v.InferOutput<typeof ErrorChunkSchema>) + "\n",
              );

              return;

            case "Decoding":
              res.write(
                JSON.stringify({
                  type: "decodeProgress",
                  progress: chunk.progress,
                } satisfies v.InferOutput<typeof DecodeProgressChunkSchema>) +
                  "\n",
              );

              break;
            case "Inference":
              result += chunk.content;

              res.write(
                JSON.stringify({
                  type: "inference",
                  content: chunk.content,
                } satisfies v.InferOutput<typeof InferenceChunkSchema>) + "\n",
              );

              break;
            case "Epilogue":
              return chunk;
            default:
              throw unreachable(chunk);
          }
        }

        throw new Error("Inference node did not return epilogue");
      },
      {
        retries: 2,
        onFailedAttempt: (error) => {
          if (error instanceof FetchError || error instanceof ResponseOkError) {
            konsole.warn(
              `Inference node /infer call error (${error.retriesLeft} retries left)`,
              error,
            );
          } else {
            throw error;
          }
        },
      },
    );

    if (!inferenceNodeResponse) {
      res.end();
      return;
    }

    const gptInference = (
      await d.db
        .insert(d.gptInferences)
        .values({
          sessionId: gptSession.id,
          prompt: body.output.prompt,
          options: body.output.options,
          nEval: body.output.nEval,
          stream: true,
          aborted: inferenceNodeResponse.aborted,
          tokenLength: inferenceNodeResponse.tokenLength,
          result,
          inferenceDuration: inferenceNodeResponse.duration,
        })
        .returning({
          id: d.gptInferences.id,
          result: d.gptInferences.result,
        })
    )[0];

    res.write(
      JSON.stringify({
        type: "epilogue",
        inferenceId: gptInference.id,
        duration: inferenceNodeResponse.duration,
        contextLength: inferenceNodeResponse.contextLength,
      } satisfies v.InferOutput<typeof EpilogueChunkSchema>) + "\n",
    );

    res.end();
  });

import { d } from "@/lib/drizzle.js";
import { FetchError, ResponseOkError } from "@/lib/errors.js";
import * as inferenceNodeApi from "@/lib/inferenceNodeApi.js";
import { konsole } from "@/lib/konsole.js";
import { redis } from "@/lib/redis.js";
import { parseTyped, v } from "@/lib/valibot.js";
import bodyParser from "body-parser";
import cors from "cors";
import { and, eq, isNull } from "drizzle-orm";
import { Router } from "express";
import pRetry from "p-retry";
import {
  InferenceNodeSchema,
  inferenceNodeKey,
} from "../inferenceNodes/common.js";

const RequestBodySchema = v.object({
  prompt: v.string(),
});

const ResponseBodySchema = v.object({
  decodingId: v.string(),
  kvCacheSize: v.number(),
});

/**
 * Decode a prompt with the GPT session.
 */
export default Router()
  .use(cors())
  .use(bodyParser.json())
  .post("/gpts/:gptSessionId/decode", async (req, res, next) => {
    const gptSession = await d.db.query.gptSessions.findFirst({
      where: and(
        eq(d.gptSessions.id, req.params.gptSessionId),
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

    const inferenceNodeResponse = await pRetry(
      () =>
        inferenceNodeApi.decode(inferenceNode.baseUrl, {
          sessionId: gptSession.id,
          prompt: body.output.prompt,
        }),
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
          decodingDuration: inferenceNodeResponse.duration,
        })
        .returning({
          id: d.gptDecodings.id,
        })
    )[0];

    res.status(200).json(
      parseTyped(ResponseBodySchema, {
        decodingId: gptDecoding.id,
        kvCacheSize: inferenceNodeResponse.kvCacheSize,
      }),
    );
  });

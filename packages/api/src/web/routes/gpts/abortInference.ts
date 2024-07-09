import { d } from "@/lib/drizzle.js";
import { FetchError, ResponseOkError } from "@/lib/errors.js";
import * as inferenceNodeApi from "@/lib/inferenceNodeApi.js";
import { konsole } from "@/lib/konsole.js";
import { redis } from "@/lib/redis.js";
import { v } from "@/lib/valibot.js";
import cors from "cors";
import { and, eq, isNull } from "drizzle-orm";
import { Router } from "express";
import pRetry from "p-retry";
import {
  InferenceNodeSchema,
  inferenceNodeKey,
} from "../inferenceNodes/common.js";
import { GPT_SESSION_ID_SCHEMA } from "./_common.js";

/**
 * Abort the GPT session inference.
 */
export default Router()
  .use(cors())
  .post("/gpts/:gptSessionId/abort-inference", async (req, res, next) => {
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

    const inferenceNode = await redis
      .get(inferenceNodeKey(gptSession.inferenceNodeId))
      .then((x) =>
        x ? v.parse(InferenceNodeSchema, JSON.parse(x)) : undefined,
      );

    if (!inferenceNode) {
      konsole.warn("Inference node is dead", gptSession);
      return res.status(410).send("Inference node is dead");
    }

    await pRetry(
      () =>
        inferenceNodeApi.abortInference(
          inferenceNode.baseUrl,
          gptSession.inferenceNodeSessionId,
        ),
      {
        retries: 2,
        onFailedAttempt: (error) => {
          if (error instanceof FetchError || error instanceof ResponseOkError) {
            konsole.warn(
              `Inference node /abort-inference fetch error (${error.retriesLeft} retries left)`,
              error,
            );
          } else {
            throw error;
          }
        },
        shouldRetry: (error) => {
          if (error instanceof ResponseOkError) {
            if (error.response.status === 409) {
              res.status(409).send("Already aborted");
              return false;
            } else if (error.response.status === 404) {
              // The inference node may have been restarted and lost the session.
              // FIXME: Shall check if the session is still running on the inference node.
              throw new Error("GPT session not found on inference node");
            }
          }

          return true;
        },
      },
    );

    res.sendStatus(204);
  });

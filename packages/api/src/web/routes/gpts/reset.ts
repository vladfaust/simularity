import { d } from "@/lib/drizzle.js";
import { FetchError, ResponseOkError } from "@/lib/errors.js";
import * as inferenceNodeApi from "@/lib/inferenceNodeApi.js";
import { konsole } from "@/lib/konsole.js";
import { redis } from "@/lib/redis.js";
import { parseTyped, v } from "@/lib/valibot.js";
import cors from "cors";
import { and, eq, isNull } from "drizzle-orm";
import { Router } from "express";
import pRetry from "p-retry";
import {
  InferenceNodeSchema,
  inferenceNodeKey,
} from "../inferenceNodes/common.js";
import { GPT_SESSION_ID_SCHEMA } from "./_common.js";

const ResponseBodySchema = v.object({
  resetId: v.string(),
});

export default Router()
  .use(cors())
  .post("/gpts/:gptSessionId/reset", async (req, res, next) => {
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
      () => inferenceNodeApi.reset(inferenceNode.baseUrl, gptSession.id),
      {
        retries: 2,
        onFailedAttempt: (error) => {
          if (error instanceof FetchError || error instanceof ResponseOkError) {
            konsole.warn(
              `Inference node /reset call error (${error.retriesLeft} retries left)`,
              error,
            );
          } else {
            throw error;
          }
        },
      },
    );

    const gptReset = (
      await d.db
        .insert(d.gptResets)
        .values({ sessionId: gptSession.id })
        .returning({ id: d.gptResets.id })
    )[0];

    res.status(200).json(
      parseTyped(ResponseBodySchema, {
        resetId: gptReset.id,
      }),
    );
  });

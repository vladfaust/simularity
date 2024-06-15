import { d } from "@/lib/drizzle.js";
import { FetchError, ResponseOkError } from "@/lib/errors.js";
import * as inferenceNodeApi from "@/lib/inferenceNodeApi.js";
import { konsole } from "@/lib/konsole.js";
import { parseTyped, v } from "@/lib/valibot.js";
import bodyParser from "body-parser";
import cors from "cors";
import { randomUUID } from "crypto";
import { Router } from "express";
import pRetry from "p-retry";
import { findInferenceNode } from "./_common.js";

const RequestBodySchema = v.object({
  model: v.string(),
});

const ResponseBodySchema = v.object({
  id: v.string(),
});

/**
 * Create a new GPT session.
 */
export default Router()
  .use(cors())
  .use(bodyParser.json())
  .post("/gpts", async (req, res, next) => {
    const body = v.safeParse(RequestBodySchema, req.body);
    if (!body.success) {
      konsole.log("Invalid request body to /gpts", v.flatten(body.issues));
      return res.status(400).json({
        error: "Invalid request body",
        issues: v.flatten(body.issues),
      });
    }

    const node = await findInferenceNode(body.output.model);
    if (!node) {
      konsole.warn("No inference node available");
      return res.status(503).send("No inference node available for this model");
    }

    const gptSessionId = randomUUID();
    await pRetry(
      () => inferenceNodeApi.create(node.baseUrl, { id: gptSessionId }),
      {
        retries: 2,
        onFailedAttempt: (error) => {
          if (error instanceof FetchError || error instanceof ResponseOkError) {
            konsole.warn(
              `Inference node /create call error (${error.retriesLeft} retries left)`,
              error,
            );
          } else {
            throw error;
          }
        },
      },
    );

    const session = (
      await d.db
        .insert(d.gptSessions)
        .values({
          id: gptSessionId,
          inferenceNodeId: node.id,
          model: body.output.model,
        })
        .returning({
          id: d.gptSessions.id,
        })
    )[0];
    konsole.info("Created GPT session", session);

    return res.status(201).json(parseTyped(ResponseBodySchema, session));
  });

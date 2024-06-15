import { FetchError, ResponseOkError } from "@/lib/errors.js";
import * as inferenceNodeApi from "@/lib/inferenceNodeApi.js";
import { konsole } from "@/lib/konsole.js";
import { parseTyped, v } from "@/lib/valibot.js";
import bodyParser from "body-parser";
import cors from "cors";
import { Router } from "express";
import pRetry from "p-retry";
import { findInferenceNode } from "./_common.js";

const RequestBodySchema = v.object({
  model: v.string(),
  prompt: v.string(),
});

const ResponseBodySchema = v.object({
  tokenCount: v.number(),
});

export default Router()
  .use(cors())
  .use(bodyParser.json())
  .post("/gpts/token-count", async (req, res) => {
    const body = v.safeParse(RequestBodySchema, req.body);
    if (!body.success) {
      konsole.warn(
        "Invalid request body to /gpts/token-count",
        v.flatten(body.issues),
      );

      return res.status(400).send("Invalid request body");
    }

    const node = await findInferenceNode(body.output.model);
    if (!node) {
      konsole.warn("No inference node available");
      return res.status(503).send("No inference node available for this model");
    }

    const inferenceNodeResponse = await pRetry(
      () =>
        inferenceNodeApi.tokenCount(node.baseUrl, {
          prompt: body.output.prompt,
        }),
      {
        retries: 2,
        onFailedAttempt: (error) => {
          if (error instanceof FetchError || error instanceof ResponseOkError) {
            konsole.warn(
              `Inference node /tokenCount call error (${error.retriesLeft} retries left)`,
              error,
            );
          } else {
            throw error;
          }
        },
      },
    );

    res.status(200).json(parseTyped(ResponseBodySchema, inferenceNodeResponse));
  });

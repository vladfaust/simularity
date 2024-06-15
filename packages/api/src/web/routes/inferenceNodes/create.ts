import { env } from "@/env.js";
import { konsole } from "@/lib/konsole.js";
import { redis } from "@/lib/redis.js";
import { v } from "@/lib/valibot.js";
import bodyParser from "body-parser";
import { Router } from "express";
import { InferenceNodeSchema, inferenceNodeKey } from "./common.js";

/**
 * Register an inference node.
 */
export default Router()
  .use(bodyParser.json())
  .post("/inference-nodes", async (req, res, next) => {
    const secret = req.headers.authorization?.split("Token ")[1];
    if (!secret || secret !== env.INFERENCE_NODE_SECRET) {
      return res.sendStatus(401);
    }

    const body = v.safeParse(InferenceNodeSchema, req.body);
    if (!body.success) {
      konsole.warn("Invalid request body to /inference/register", body.issues);
      return res.status(400).send("Invalid request body");
    }

    if (await redis.get(inferenceNodeKey(body.output.id))) {
      konsole.warn("Inference node already registered", body.output);
      return res.status(400).send("Already registered");
    }

    konsole.info("Registering inference node", body.output);

    await redis
      .multi()
      .set(
        inferenceNodeKey(body.output.id),
        JSON.stringify(
          body.output satisfies v.InferOutput<typeof InferenceNodeSchema>,
        ),
        "EX",
        env.INFERENCE_NODE_TTL,
      )
      .exec();

    return res.sendStatus(201);
  });

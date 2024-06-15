import { env } from "@/env.js";
import { konsole } from "@/lib/konsole.js";
import { redis } from "@/lib/redis.js";
import bodyParser from "body-parser";
import { Router } from "express";
import { inferenceNodeKey } from "./common.js";

/**
 * Accept an inference node heartbeat.
 */
export default Router()
  .use(bodyParser.json())
  .head("/inference-nodes/:id/heartbeat", async (req, res, next) => {
    const secret = req.headers.authorization?.split("Token ")[1];
    if (!secret || secret !== env.INFERENCE_NODE_SECRET) {
      return res.sendStatus(401);
    }

    if (
      !(await redis.getex(
        inferenceNodeKey(req.params.id),
        "EX",
        env.INFERENCE_NODE_TTL,
      ))
    ) {
      konsole.warn("Inference node already expired", { id: req.params.id });
      return res.status(404).send("Already expired");
    }

    return res.sendStatus(200);
  });

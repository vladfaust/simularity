import { redis } from "@/lib/redis.js";
import cors from "cors";
import { Router } from "express";
import { createJwt, ensureUser } from "./common.js";
import { NONCE_TTL, nonceRedisKey } from "./create.js";

/**
 * Authorize a nonce, so that the user can get the JWT from it.
 */
export default Router()
  .use(cors())
  .post("/:nonce", async (req, res) => {
    const user = await ensureUser(req, res);
    if (!user) return res.sendStatus(401);

    const jwt = await createJwt(user.id);
    await redis.set(nonceRedisKey(req.params.nonce), jwt, "EX", NONCE_TTL);

    return res.sendStatus(201);
  });

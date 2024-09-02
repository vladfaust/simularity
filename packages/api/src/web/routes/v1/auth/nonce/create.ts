import { redis } from "@/lib/redis.js";
import cors from "cors";
import { Router } from "express";
import { createJwt, ensureUser } from "../_common.js";
import { NONCE_TTL, nonceRedisKey } from "./_common.js";

/**
 * Create an auth object by a nonce, so that it can be queried to get a JWT.
 * Nonce lives for {@link NONCE_TTL}.
 * Requires authentication.
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

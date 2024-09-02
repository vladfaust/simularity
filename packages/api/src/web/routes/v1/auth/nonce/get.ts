import { redis } from "@/lib/redis.js";
import { Router } from "express";
import { nonceRedisKey } from "./_common.js";

/**
 * Get an auth by a secure nonce (passed to ./create.ts).
 * Whoever possesses the nonce can use it to get the JWT, but only once.
 */
export default Router().get("/:nonce", async (req, res) => {
  const jwt = await redis.getdel(nonceRedisKey(req.params.nonce));

  if (!jwt) {
    return res
      .status(401)
      .json({ error: "Invalid, expired or non-authenticated nonce" });
  }

  return res.json({ jwt });
});

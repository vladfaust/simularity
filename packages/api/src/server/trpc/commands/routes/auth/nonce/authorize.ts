import { redis } from "@/lib/redis.js";
import { v } from "@/lib/valibot.js";
import { protectedProcedure } from "@/server/trpc/middleware/auth.js";
import { wrap } from "@typeschema/valibot";
import { NONCE_TTL, nonceRedisKey } from "./_common.js";

/**
 * Create an auth object by a nonce, so that it can be queried to get a cookie.
 * Nonce lives for {@link NONCE_TTL}.
 * Requires authentication.
 */
export default protectedProcedure
  .input(wrap(v.object({ nonce: v.string() })))
  .mutation(async ({ ctx, input }) => {
    await redis.set(nonceRedisKey(input.nonce), ctx.userId, "EX", NONCE_TTL);
  });

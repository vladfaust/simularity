import { redis } from "@/lib/redis.js";
import { v } from "@/lib/valibot.js";
import { t } from "@/server/trpc.js";
import { wrap } from "@typeschema/valibot";
import { ExpressContext } from "../../../context.js";
import { setCookie } from "../_common.js";
import { nonceRedisKey } from "./_common.js";

/**
 * Get an auth by a secure nonce (passed to ./create.ts).
 * Whoever possesses the nonce can use it to get the cookie, but only once.
 */
export default t.procedure
  .input(
    wrap(
      v.object({
        nonce: v.string(),
      }),
    ),
  )
  .output(
    wrap(
      v.nullable(
        v.object({
          userId: v.string(),
          jwt: v.string(),
          cookieMaxAge: v.number(),
        }),
      ),
    ),
  )
  .query(async ({ ctx, input }) => {
    const userId = await redis.getdel(nonceRedisKey(input.nonce));

    if (!userId) {
      return null;
    }

    const { jwt, cookieMaxAge: cookieMaxAge } = await setCookie(
      ctx as ExpressContext,
      userId,
    );

    return {
      userId,
      jwt,
      cookieMaxAge,
    };
  });

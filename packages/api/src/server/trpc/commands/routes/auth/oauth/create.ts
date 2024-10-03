import { env } from "@/env.js";
import { konsole } from "@/lib/konsole.js";
import { redis } from "@/lib/redis.js";
import { OAuthProviderIdSchema } from "@/lib/schema.js";
import { v } from "@/lib/valibot.js";
import { t } from "@/server/trpc.js";
import { TRPCError } from "@trpc/server";
import { wrap } from "@typeschema/valibot";
import { toSeconds } from "duration-fns";
import { nanoid } from "nanoid";
import { OAuthRedisObject, oauthStateRedisKey } from "./_common.js";

/**
 * Create an OAuth authorization URL.
 */
export default t.procedure
  .input(
    wrap(
      v.object({
        providerId: OAuthProviderIdSchema,
        reason: v.picklist(["login", "link"]),
        returnUrl: v.optional(v.pipe(v.string(), v.url())),
      }),
    ),
  )
  .output(
    wrap(
      v.object({
        url: v.string(),
        state: v.string(),
      }),
    ),
  )
  .mutation(async ({ input }) => {
    const provider = env.OAUTH_PROVIDERS[input.providerId];

    if (!provider) {
      konsole.debug("Invalid providerId", input.providerId);
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid providerId",
      });
    }

    const state = nanoid();

    await redis.set(
      oauthStateRedisKey(state),
      JSON.stringify({
        providerId: input.providerId,
        reason: input.reason,
        returnUrl: input.returnUrl,
      } satisfies OAuthRedisObject),
      "EX",
      toSeconds({ minutes: 5 }),
    );

    const url = new URL(
      (provider.authorizeUrl || provider.baseUrl) + "/authorize",
    );
    url.searchParams.set("client_id", provider.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", provider.redirectUris[input.reason]);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", provider.scope);

    return {
      url: url.toString(),
      state,
    };
  });

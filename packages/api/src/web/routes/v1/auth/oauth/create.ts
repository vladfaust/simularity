import { env } from "@/env.js";
import { konsole } from "@/lib/konsole.js";
import { OAuthProviderIdSchema } from "@/lib/oauth.js";
import { redis } from "@/lib/redis.js";
import { v } from "@/lib/valibot.js";
import bodyParser from "body-parser";
import cors from "cors";
import { toSeconds } from "duration-fns";
import { Router } from "express";
import { nanoid } from "nanoid";
import { OAuthRedisObject, oauthStateRedisKey } from "./_common.js";

const RequestBodySchema = v.object({
  providerId: OAuthProviderIdSchema,
  reason: v.picklist(["login", "link"]),
  returnUrl: v.optional(v.pipe(v.string(), v.url())),
});

const ResponseBodySchema = v.object({
  url: v.string(),
  state: v.string(),
});

/**
 * Create an OAuth authorization URL.
 */
export default Router()
  .use(cors())
  .use(bodyParser.json())
  .post("/", async (req, res) => {
    const body = v.safeParse(RequestBodySchema, req.body);
    if (!body.success) {
      konsole.debug("Invalid request body", v.flatten(body.issues));
      return res.status(400).json({
        error: "Invalid request body",
        issues: v.flatten(body.issues),
      });
    }

    const provider = env.OAUTH_PROVIDERS[body.output.providerId];

    if (!provider) {
      konsole.debug("Invalid providerId", body.output.providerId);
      return res.status(400).json({
        error: "Invalid providerId",
      });
    }

    const state = nanoid();

    await redis.set(
      oauthStateRedisKey(state),
      JSON.stringify({
        providerId: body.output.providerId,
        reason: body.output.reason,
        returnUrl: body.output.returnUrl,
      } satisfies OAuthRedisObject),
      "EX",
      toSeconds({ minutes: 5 }),
    );

    const url = new URL(
      (provider.authorizeUrl || provider.baseUrl) + "/authorize",
    );
    url.searchParams.set("client_id", provider.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set(
      "redirect_uri",
      provider.redirectUris[body.output.reason],
    );
    url.searchParams.set("state", state);
    url.searchParams.set("scope", provider.scope);

    return res.status(201).json({
      url: url.toString(),
      state,
    } satisfies v.InferOutput<typeof ResponseBodySchema>);
  });

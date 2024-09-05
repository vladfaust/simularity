import { v } from "@/lib/valibot.js";
import * as dotenv from "dotenv";
import { OAuthProviderIdSchema, OAuthProviderSchema } from "./lib/oauth.js";

/**
 * `"1"`, `"true"` is true, `"0"`, `"false"` is false, case insensitive.
 */
function envBool() {
  return v.pipe(
    v.string(),
    v.toLowerCase(),
    v.check(
      (x) => ["1", "0", "true", "false"].includes(x),
      `must be one of "1", "0", "true", "false"`,
    ),
    v.transform((x) => {
      switch (x) {
        case "1":
        case "true":
          return true;
        case "0":
        case "false":
          return false;
        default:
          throw new Error("(BUG) Unreachable");
      }
    }),
  );
}

/**
 * Parse a port number.
 */
function port() {
  return v.pipe(
    v.string(),
    v.transform((x) => parseInt(x, 10)),
    v.check((x) => x > 0 && x < 65536, "must be between 0 and 65536"),
  );
}

dotenv.config();

const parseResult = v.safeParse(
  v.object({
    NODE_ENV: v.optional(
      v.union([v.literal("development"), v.literal("production")]),
      "development",
    ),
    DATABASE_URL: v.pipe(v.string(), v.url()),
    REDIS_URL: v.pipe(v.string(), v.url()),

    HOST: v.string(),
    PORT: v.pipe(
      v.string(),
      v.transform((x) => parseInt(x, 10)),
      v.check((x) => x > 0 && x < 65536, "must be between 0 and 65536"),
    ),

    JWT_SECRET: v.pipe(
      v.string(),
      v.transform((str) => Buffer.from(str, "hex")),
    ),

    JWT_ISSUER: v.string(),

    RUNPOD_BASE_URL: v.pipe(v.string(), v.url()),
    RUNPOD_API_KEY: v.string(),

    SMTP_HOST: v.string(),
    SMTP_PORT: port(),
    SMTP_FROM: v.pipe(v.string(), v.email()),
    SMTP_AUTH_PASS: v.optional(v.string()),
    SMTP_AUTH_USER: v.optional(v.string()),
    SMTP_HEADERS: v.optional(
      v.pipe(
        v.string(),
        v.transform((x) => JSON.parse(x)),
        v.record(v.string(), v.string()),
      ),
    ),

    OAUTH_PROVIDERS: v.pipe(
      v.optional(v.string(), "{}"),
      v.transform((x) => JSON.parse(x)),
      v.record(OAuthProviderIdSchema, OAuthProviderSchema),
    ),

    /**
     * The secret used to sign Patreon webhook payloads.
     * The endpoint is disabled if this is not set.
     */
    PATREON_WEBHOOK_SECRET: v.optional(v.string()),

    /**
     * Patreon tiers, ordered from less to more important.
     * The most important tier takes precedence over the less important ones.
     */
    PATREON_TIERS: v.pipe(
      v.optional(v.string(), "[]"),
      v.transform((x) => JSON.parse(x)),
      v.array(
        v.object({
          id: v.string(),
          name: v.string(),
        }),
      ),
    ),
  }),
  process.env,
);

if (!parseResult.success) {
  throw new Error(
    `Invalid env ${JSON.stringify(v.flatten(parseResult.issues).nested, null, 2)}`,
  );
}

export const env = parseResult.output;

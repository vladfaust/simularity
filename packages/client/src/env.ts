import { v } from "./lib/valibot";

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

const safeParseOutput = v.safeParse(
  v.object({
    /** Set to true in production. */
    PROD: v.boolean(),

    /** Whether to enable immersive mode. */
    VITE_EXPERIMENTAL_IMMERSIVE_MODE: v.optional(envBool()),

    /** Whether to enable TTS. */
    VITE_EXPERIMENTAL_VOICER: v.optional(envBool()),

    /** Optional Plausible API host. */
    VITE_PLAUSIBLE_API_HOST: v.optional(v.string()),

    /** Optional Sentry DSN. */
    VITE_SENTRY_DSN: v.optional(v.string()),

    /** Default API server base URL. */
    VITE_API_BASE_URL: v.pipe(v.string(), v.url()),

    /** Default web server base URL. */
    VITE_WEB_BASE_URL: v.pipe(v.string(), v.url()),

    /** SQLite database path, relative to $APPLOCALDATA. */
    VITE_DATABASE_PATH: v.string(),

    /** Commit hash of the current build. */
    VITE_COMMIT_HASH: v.optional(v.string()),

    /** Human-readable version of the current build. */
    VITE_VERSION: v.optional(v.string()),

    VITE_DISCORD_URL: v.optional(v.pipe(v.string(), v.url())),
    VITE_REDDIT_URL: v.optional(v.pipe(v.string(), v.url())),
    VITE_X_URL: v.optional(v.pipe(v.string(), v.url())),
  }),
  import.meta.env,
);

if (!safeParseOutput.success) {
  throw new Error(
    `Invalid environment variables: ${JSON.stringify(v.flatten(safeParseOutput.issues))}`,
  );
}

const env = safeParseOutput.output;

export { env };

import { v } from "@/lib/valibot.js";
import * as dotenv from "dotenv";

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

dotenv.config();

const parseResult = v.safeParse(
  v.object({
    DATABASE_URL: v.pipe(v.string(), v.url()),
    REDIS_URL: v.pipe(v.string(), v.url()),

    HOST: v.string(),
    PORT: v.pipe(
      v.string(),
      v.transform((x) => parseInt(x, 10)),
      v.check((x) => x > 0 && x < 65536, "must be between 0 and 65536"),
    ),

    /**
     * The secret key used to authenticate inference nodes.
     */
    INFERENCE_NODE_SECRET: v.string(),

    /**
     * The time-to-live (in seconds) for inference node keys.
     */
    INFERENCE_NODE_TTL: v.pipe(
      v.string(),
      v.transform((x) => parseInt(x, 10)),
      v.check((x) => x > 0, "must be greater than 0"),
    ),

    /**
     * Whether to allow all session caches, used in dev.
     */
    ALLOW_ALL_SESSION_CACHE: v.optional(envBool()),
  }),
  process.env,
);

if (!parseResult.success) {
  throw new Error(
    `Invalid env ${JSON.stringify(v.flatten(parseResult.issues).nested, null, 2)}`,
  );
}

export const env = parseResult.output;

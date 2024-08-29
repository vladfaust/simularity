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
  }),
  process.env,
);

if (!parseResult.success) {
  throw new Error(
    `Invalid env ${JSON.stringify(v.flatten(parseResult.issues).nested, null, 2)}`,
  );
}

export const env = parseResult.output;

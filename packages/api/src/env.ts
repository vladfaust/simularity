import { v } from "@/lib/valibot.js";
import * as dotenv from "dotenv";

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
  }),
  process.env,
);

if (!parseResult.success) {
  throw new Error(
    `Invalid env ${JSON.stringify(v.flatten(parseResult.issues).nested, null, 2)}`,
  );
}

export const env = parseResult.output;

import { pgTable } from "drizzle-orm/pg-core";
import { bytea } from "./common.js";

/**
 * List of well-known GPT KV cache hashes.
 */
export const gptSessionHashes = pgTable("gpt_session_hashes", {
  hash: bytea("hash", { length: 32 }).primaryKey(),
});

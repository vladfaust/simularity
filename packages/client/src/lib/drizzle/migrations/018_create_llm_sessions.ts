import { sql } from "@/lib/utils";

export const name = "018_create_llm_sessions";

export function up() {
  return sql`
    -- Create the "llm_local_sessions" table.
    CREATE TABLE "llm_local_sessions" (
      "id" INTEGER PRIMARY KEY,
      "internal_id" TEXT NOT NULL,
      "model_path" TEXT NOT NULL,
      "model_hash" BLOB NOT NULL,
      "context_size" INTEGER NOT NULL,
      "created_at" INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
    -- Create the "llm_remote_sessions" table.
    CREATE TABLE "llm_remote_sessions" (
      "id" INTEGER PRIMARY KEY,
      "external_id" TEXT NOT NULL,
      "base_url" TEXT NOT NULL,
      "model_id" TEXT NOT NULL,
      "context_size" INTEGER NOT NULL,
      "created_at" INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
  `;
}

export function down() {
  return sql`
    -- Drop the "llm_local_sessions" and "llm_remote_sessions" tables.
    DROP TABLE "llm_remote_sessions";
    DROP TABLE "llm_local_sessions";
  `;
}

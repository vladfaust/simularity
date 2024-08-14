import { sql } from "@/lib/utils";

export const name = "019_refactor_llm_completions";

export function up() {
  return sql`
    -- Drop "llama_inferences_model_hash_index" index.
    DROP INDEX llama_inferences_model_hash_index;
    -- Rename "llama_inferences" to "llm_completions".
    ALTER TABLE llama_inferences
    RENAME TO llm_completions;
    -- Add "local_session_id" and "remote_session_id" columns to "llm_completions".
    ALTER TABLE llm_completions
    ADD COLUMN local_session_id INTEGER;
    ALTER TABLE llm_completions
    ADD COLUMN remote_session_id INTEGER;
    -- Remove "model_name" and "model_hash" columns from "llm_completions".
    ALTER TABLE llm_completions
    DROP COLUMN model_name;
    ALTER TABLE llm_completions
    DROP COLUMN model_hash;
    -- Rename "prompt" column to "input" in "llm_completions".
    ALTER TABLE llm_completions
    RENAME COLUMN prompt TO input;
    -- Drop "details" column from "llm_completions".
    ALTER TABLE llm_completions
    DROP COLUMN details;
    -- Add "input_length", "output_length", "delay_time_ms", and "execution_time_ms" columns to "llm_completions".
    ALTER TABLE llm_completions
    ADD COLUMN input_length INTEGER;
    ALTER TABLE llm_completions
    ADD COLUMN output_length INTEGER;
    ALTER TABLE llm_completions
    ADD COLUMN delay_time_ms INTEGER;
    ALTER TABLE llm_completions
    ADD COLUMN execution_time_ms INTEGER;
    -- Drop "updated_at" column from "llm_completions".
    ALTER TABLE llm_completions
    DROP COLUMN updated_at;
    -- Rename "llama_inference_id" to "llm_completion_id" in "writer_updates".
    ALTER TABLE writer_updates
    RENAME COLUMN llama_inference_id TO llm_completion_id;
    -- Rename "llama_inference_id" to "llm_completion_id" in "director_updates".
    ALTER TABLE director_updates
    RENAME COLUMN llama_inference_id TO llm_completion_id;
  `;
}

export function down() {
  return sql`
    -- Rename "llm_completions" to "llama_inferences".
    ALTER TABLE llm_completions
    RENAME TO llama_inferences;
    -- Remove "local_session_id" and "remote_session_id" columns from "llm_completions".
    ALTER TABLE llm_completions
    DROP COLUMN local_session_id;
    ALTER TABLE llm_completions
    DROP COLUMN remote_session_id;
    -- Add "model_name" and "model_hash" columns to "llm_completions".
    ALTER TABLE llm_completions
    ADD COLUMN model_name TEXT;
    ALTER TABLE llm_completions
    ADD COLUMN model_hash BLOB;
    -- Rename "input" column to "prompt" in "llm_completions".
    ALTER TABLE llm_completions
    RENAME COLUMN input TO prompt;
    -- Add "details" column to "llm_completions".
    ALTER TABLE llm_completions
    ADD COLUMN details TEXT CHECK (json_valid(details));
    -- Remove "input_length", "output_length", "delay_time_ms", and "execution_time_ms" columns from "llm_completions".
    ALTER TABLE llm_completions
    DROP COLUMN input_length;
    ALTER TABLE llm_completions
    DROP COLUMN output_length;
    ALTER TABLE llm_completions
    DROP COLUMN delay_time_ms;
    ALTER TABLE llm_completions
    DROP COLUMN execution_time_ms;
    -- Add "updated_at" column to "llm_completions".
    ALTER TABLE llm_completions
    ADD COLUMN updated_at INTEGER;
    -- Rename "llm_completion_id" to "llama_inference_id" in "writer_updates".
    ALTER TABLE writer_updates
    RENAME COLUMN llm_completion_id TO llama_inference_id;
    -- Rename "llm_completion_id" to "llama_inference_id" in "director_updates".
    ALTER TABLE director_updates
    RENAME COLUMN llm_completion_id TO llama_inference_id;
    -- Create "llama_inferences_model_hash_index" index.
    CREATE INDEX llama_inferences_model_hash_index ON llama_inferences (model_hash);
  `;
}

import { sql } from "@/lib/utils";

export const name = "020_add_real_time_to_llm_completions";

export function up() {
  return sql`
    -- Add "real_time" column to "llm_completions".
    ALTER TABLE llm_completions
    ADD COLUMN real_time INTEGER;
  `;
}

export function down() {
  return sql`
    -- Remove "real_time" column from "llm_completions".
    ALTER TABLE llm_completions
    DROP COLUMN real_time;
  `;
}

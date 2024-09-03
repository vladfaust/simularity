import { sql } from "@/lib/utils";

export const name = "022_add_credit_cost_to_llm_completions";

export function up() {
  return sql`
    -- Add "credit_cost" column to "llm_completions" (SQLite).
    ALTER TABLE llm_completions
    ADD COLUMN credit_cost INTEGER;
  `;
}

export function down() {
  return sql`
    -- Remove "credit_cost" column from "llm_completions" (SQLite).
    ALTER TABLE llm_completions
    DROP COLUMN credit_cost;
  `;
}

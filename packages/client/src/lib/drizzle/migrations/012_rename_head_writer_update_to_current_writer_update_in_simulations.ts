import { sql } from "@/lib/utils";

export const name =
  "012_rename_head_writer_update_to_current_writer_update_in_simulations";

export function up() {
  return sql`
    -- Rename "head_writer_update_id" to "current_writer_update_id" in "simulations".
    ALTER TABLE simulations
    RENAME COLUMN head_writer_update_id TO current_writer_update_id;
  `;
}

export function down() {
  return sql`
    -- Rename "current_writer_update_id" to "head_writer_update_id" in "simulations".
    ALTER TABLE simulations
    RENAME COLUMN current_writer_update_id TO head_writer_update_id
  `;
}

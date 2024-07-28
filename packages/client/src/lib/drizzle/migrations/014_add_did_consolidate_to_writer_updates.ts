import { sql } from "@/lib/utils";

export const name = "014_add_did_consolidate_to_writer_updates";

export function up() {
  return sql`
    -- Add "did_consolidate" to "writer_updates".
    ALTER TABLE writer_updates
    ADD COLUMN did_consolidate INTEGER NOT NULL DEFAULT 0;
    -- Update all writer updates with checkpoints triggered by them.
    UPDATE writer_updates
    SET
      did_consolidate = 1
    WHERE
      id IN (
        SELECT
          writer_update_id
        FROM
          checkpoints
      );
  `;
}

export function down() {
  return sql`
    -- Drop "did_consolidate" from "writer_updates".
    ALTER TABLE writer_updates
    DROP COLUMN did_consolidate;
  `;
}

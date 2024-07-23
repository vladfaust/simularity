import { sql } from "@/lib/utils";

export const name = "010_create_checkpoints";

export function up() {
  return sql`
    -- Create "checkpoints" table.
    CREATE TABLE checkpoints (
      id INTEGER PRIMARY KEY,
      writer_update_id TEXT NOT NULL REFERENCES writer_updates (id) ON DELETE CASCADE,
      summary TEXT,
      state TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    -- Add "checkpoint_id" to "writer_updates".
    ALTER TABLE writer_updates
    ADD COLUMN checkpoint_id INTEGER REFERENCES checkpoints (id) ON DELETE CASCADE;
  `;
}

export function down() {
  return sql`
    -- Remove "checkpoint_id" from "writer_updates".
    ALTER TABLE writer_updates
    DROP COLUMN checkpoint_id;
    -- Drop "checkpoints" table.
    DROP TABLE checkpoints;
  `;
}

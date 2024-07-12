import { sql } from "@/lib/utils";

export const name = "009_add_character_id_to_writer_updates";

export function up() {
  return sql`
    -- Add "character_id" column to "writer_updates".
    ALTER TABLE writer_updates
    ADD COLUMN character_id VARCHAR(32);
  `;
}

export function down() {
  return sql`
    -- Remove "character_id" column from "writer_updates".
    ALTER TABLE writer_updates
    DROP COLUMN character_id;
  `;
}

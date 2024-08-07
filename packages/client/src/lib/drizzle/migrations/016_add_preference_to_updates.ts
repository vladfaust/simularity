import { sql } from "@/lib/utils";

export const name = "016_add_preference_to_updates";

export function up() {
  return sql`
    -- Add "preference" to "writer_updates".
    ALTER TABLE writer_updates
    ADD COLUMN preference INTEGER;
    -- Add "preference" to "director_updates".
    ALTER TABLE director_updates
    ADD COLUMN preference INTEGER;
  `;
}

export function down() {
  return sql`
    -- Drop "preference" from "director_updates".
    ALTER TABLE director_updates
    DROP COLUMN preference;
    -- Drop "preference" from "writer_updates".
    ALTER TABLE writer_updates
    DROP COLUMN preference;
  `;
}

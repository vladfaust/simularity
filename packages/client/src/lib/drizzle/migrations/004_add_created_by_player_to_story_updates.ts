import { sql } from "@/lib/utils";

export const name = "004_add_created_by_player_to_story_updates";

export function up() {
  return sql`
    -- Add "created_by_player" column to "story_updates" table.
    ALTER TABLE story_updates
    ADD COLUMN created_by_player INTEGER NOT NULL DEFAULT 0;
  `;
}

export function down() {
  return sql`
    -- Revert: -- Add "created_by_player" column to "story_updates" table.
    ALTER TABLE story_updates
    DROP COLUMN created_by_player;
  `;
}

import { sql } from "@/lib/utils";

export const name = "005_add_simulation_head_tracking";

export function up() {
  return sql`
    -- Add "head_story_update_id" to "simulations" table
    ALTER TABLE simulations
    ADD COLUMN head_story_update_id INTEGER;
    --
    -- Add "parent_update_id" to "story_updates" table
    ALTER TABLE story_updates
    ADD COLUMN parent_update_id TEXT;
  `;
}

export function down() {
  return sql`
    ALTER TABLE story_updates
    DROP COLUMN parent_update_id;
    --
    ALTER TABLE simulations
    DROP COLUMN head_story_update_id;
  `;
}

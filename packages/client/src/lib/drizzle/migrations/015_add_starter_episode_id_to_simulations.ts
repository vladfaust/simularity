import { sql } from "@/lib/utils";

export const name = "015_add_starter_episode_id_to_simulations";

export function up() {
  return sql`
    -- Add "starter_episode_id" to "simulations".
    ALTER TABLE simulations
    ADD COLUMN starter_episode_id TEXT;
  `;
}

export function down() {
  return sql`
    -- Drop "starter_episode_id" from "simulations".
    ALTER TABLE simulations
    DROP COLUMN starter_episode_id;
  `;
}

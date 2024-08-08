import { sql } from "@/lib/utils";

export const name = "017_add_simulation_day_clock_to_writer_updates";

export function up() {
  return sql`
    -- Add "simulation_day_clock" to "writer_updates".
    ALTER TABLE writer_updates
    ADD COLUMN simulation_day_clock INTEGER;
  `;
}

export function down() {
  return sql`
    -- Drop "simulation_day_clock" from "writer_updates".
    ALTER TABLE writer_updates
    DROP COLUMN simulation_day_clock;
  `;
}

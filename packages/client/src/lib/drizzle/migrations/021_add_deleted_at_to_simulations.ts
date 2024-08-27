import { sql } from "@/lib/utils";

export const name = "021_add_deleted_at_to_simulations";

export function up() {
  return sql`
    -- Add "deleted_at" column to "simulations".
    ALTER TABLE simulations
    ADD COLUMN deleted_at INTEGER;
    -- Add "deleted_at" index to "simulations".
    CREATE INDEX idx_simulations_deleted_at ON simulations (deleted_at);
  `;
}

export function down() {
  return sql`
    -- Remove "deleted_at" column from "simulations".
    ALTER TABLE simulations
    DROP COLUMN deleted_at;
  `;
}

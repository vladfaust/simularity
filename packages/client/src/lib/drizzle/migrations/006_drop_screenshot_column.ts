import { sql } from "@/lib/utils";

export const name = "006_drop_screenshot_column";

export function up() {
  return sql`
    -- Remove "screenshot" column from "simulations".
    ALTER TABLE simulations
    DROP COLUMN screenshot;
  `;
}

export function down() {
  return sql`
    -- Add "screenshot" column to "simulations".
    ALTER TABLE simulations
    ADD COLUMN screenshot TEXT;
  `;
}

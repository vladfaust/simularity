import { sql } from "@/lib/utils";

export const name = "000_create_simulations";

export function up() {
  return sql`
    CREATE TABLE simulations (
      id TEXT PRIMARY KEY NOT NULL,
      scenario_id TEXT NOT NULL,
      screenshot TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    --
    CREATE INDEX simulations_scenario_id_index ON simulations (scenario_id);
    CREATE INDEX simulations_updated_at_index ON simulations (updated_at);
  `;
}

export function down() {
  return sql`DROP TABLE simulations; `;
}

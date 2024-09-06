import type { Transaction } from "@/lib/drizzle";
import { sql } from "drizzle-orm";
import type { Migration } from "../scripts/migrate";

export default class implements Migration {
  name = "000_create_simulations";

  async up(tx: Transaction) {
    await tx.run(sql`
      CREATE TABLE simulations (
        id INTEGER PRIMARY KEY,
        scenario_id TEXT NOT NULL,
        starter_episode_id TEXT,
        current_writer_update_id INTEGER,
        deleted_at INTEGER,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );
      --
      CREATE INDEX simulations_scenario_id_index ON simulations (scenario_id);
      CREATE INDEX simulations_deleted_at_index ON simulations (deleted_at);
      CREATE INDEX simulations_updated_at_index ON simulations (updated_at);
    `);
  }

  async down(tx: Transaction) {
    await tx.run(sql` DROP TABLE simulations; `);
  }
}

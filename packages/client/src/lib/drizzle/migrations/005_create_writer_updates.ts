import type { Transaction } from "@/lib/drizzle";
import { sql } from "drizzle-orm";
import type { Migration } from "../scripts/migrate";

export default class implements Migration {
  name = "004_create_writer_updates";

  async up(tx: Transaction) {
    await tx.run(sql`
      CREATE TABLE writer_updates (
        id INTEGER PRIMARY KEY,
        simulation_id INTEGER NOT NULL,
        parent_update_id INTEGER,
        next_update_id INTEGER,
        checkpoint_id INTEGER NOT NULL,
        did_consolidate INTEGER NOT NULL DEFAULT 0,
        created_by_player INTEGER NOT NULL DEFAULT 0,
        episode_id TEXT,
        episode_chunk_index INTEGER,
        llm_completion_id INTEGER,
        character_id TEXT,
        simulation_day_clock INTEGER NOT NULL,
        TEXT TEXT NOT NULL,
        preference INTEGER,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );
      --
      CREATE INDEX writer_updates_simulation_id_index ON writer_updates (simulation_id);
      CREATE INDEX writer_updates_parent_update_id_index ON writer_updates (parent_update_id);
      CREATE INDEX writer_updates_checkpoint_id_index ON writer_updates (checkpoint_id);
      CREATE INDEX writer_updates_created_at_index ON writer_updates (created_at);
    `);
  }

  async down(tx: Transaction) {
    await tx.run(sql` DROP TABLE writer_updates; `);
  }
}

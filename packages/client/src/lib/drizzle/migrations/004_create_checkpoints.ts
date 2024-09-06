import type { Transaction } from "@/lib/drizzle";
import { sql } from "drizzle-orm";
import type { Migration } from "../scripts/migrate";

export default class implements Migration {
  name = "003_create_checkpoints";

  async up(tx: Transaction) {
    await tx.run(sql`
      CREATE TABLE checkpoints (
        id INTEGER PRIMARY KEY,
        simulation_id INTEGER NOT NULL,
        writer_update_id INTEGER,
        summary TEXT,
        state TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );
      --
      CREATE INDEX checkpoints_simulation_id_index ON checkpoints (simulation_id);
      CREATE INDEX checkpoints_writer_update_id_index ON checkpoints (writer_update_id);
    `);
  }

  async down(tx: Transaction) {
    await tx.run(sql` DROP TABLE checkpoints; `);
  }
}

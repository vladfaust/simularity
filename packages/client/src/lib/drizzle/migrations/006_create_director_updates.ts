import type { Transaction } from "@/lib/drizzle";
import { sql } from "drizzle-orm";
import type { Migration } from "../scripts/migrate";

export default class implements Migration {
  name = "005_create_director_updates";

  async up(tx: Transaction) {
    await tx.run(sql`
      CREATE TABLE director_updates (
        id INTEGER PRIMARY KEY,
        writer_update_id INTEGER NOT NULL,
        llm_completion_id INTEGER,
        code TEXT NOT NULL,
        preference INTEGER,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );
      --
      CREATE INDEX director_updates_writer_update_id_index ON director_updates (writer_update_id);
      CREATE INDEX director_updates_created_at_index ON director_updates (created_at);
    `);
  }

  async down(tx: Transaction) {
    await tx.run(sql` DROP TABLE director_updates; `);
  }
}

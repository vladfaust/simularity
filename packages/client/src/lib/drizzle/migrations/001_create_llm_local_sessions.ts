import type { Transaction } from "@/lib/drizzle";
import { sql } from "drizzle-orm";
import type { Migration } from "../scripts/migrate";

export default class implements Migration {
  name = "001_create_llm_local_sessions";

  async up(tx: Transaction) {
    await tx.run(sql`
      CREATE TABLE llm_local_sessions (
        id INTEGER PRIMARY KEY,
        internal_id TEXT NOT NULL,
        model_path TEXT NOT NULL,
        model_hash BLOB NOT NULL,
        context_size INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );
    `);
  }

  async down(tx: Transaction) {
    await tx.run(sql` DROP TABLE llm_local_sessions; `);
  }
}

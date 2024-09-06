import type { Transaction } from "@/lib/drizzle";
import { sql } from "drizzle-orm";
import type { Migration } from "../scripts/migrate";

export default class implements Migration {
  name = "003_create_llm_completions";

  async up(tx: Transaction) {
    await tx.run(sql`
      CREATE TABLE llm_completions (
        id INTEGER PRIMARY KEY,
        local_session_id INTEGER REFERENCES llm_local_sessions (id) ON DELETE RESTRICT,
        remote_session_id INTEGER REFERENCES llm_remote_sessions (id) ON DELETE RESTRICT,
        options TEXT NOT NULL,
        input TEXT NOT NULL,
        input_length INTEGER,
        output TEXT,
        output_length INTEGER,
        error TEXT,
        delay_time_ms INTEGER,
        execution_time_ms INTEGER,
        real_time_ms INTEGER,
        credit_cost INTEGER,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );
      --
      CREATE INDEX llm_completions_created_at_index ON llm_completions (created_at);
    `);
  }

  async down(tx: Transaction) {
    await tx.run(sql` DROP TABLE llm_completions; `);
  }
}

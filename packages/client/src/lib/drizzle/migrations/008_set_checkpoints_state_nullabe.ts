import type { Transaction } from "@/lib/drizzle";
import { sql } from "drizzle-orm";
import type { Migration } from "../scripts/migrate";

export default class implements Migration {
  name = "008_set_checkpoints_state_nullabe";

  async up(tx: Transaction) {
    await tx.run(sql`PRAGMA foreign_keys = 0`);
    await tx.run(sql`
      ALTER TABLE checkpoints
      RENAME TO sqlitestudio_temp_table
    `);
    await tx.run(sql`
      CREATE TABLE checkpoints (
        id INTEGER PRIMARY KEY,
        simulation_id INTEGER NOT NULL,
        writer_update_id INTEGER,
        summary TEXT,
        state TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )
    `);
    await tx.run(sql`
      INSERT INTO
        checkpoints (id, simulation_id, writer_update_id, summary, state, created_at)
      SELECT
        id,
        simulation_id,
        writer_update_id,
        summary,
        state,
        created_at
      FROM
        sqlitestudio_temp_table
    `);
    await tx.run(sql`DROP TABLE sqlitestudio_temp_table`);
    await tx.run(sql`PRAGMA foreign_keys = 1`);
  }

  async down(tx: Transaction) {
    await tx.run(sql`PRAGMA foreign_keys = 0`);
    await tx.run(sql`
      ALTER TABLE checkpoints
      RENAME TO sqlitestudio_temp_table
    `);
    await tx.run(sql`
      CREATE TABLE checkpoints (
        id INTEGER PRIMARY KEY,
        simulation_id INTEGER NOT NULL,
        writer_update_id INTEGER,
        summary TEXT,
        state TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )
    `);
    await tx.run(sql`
      INSERT INTO
        checkpoints (id, simulation_id, writer_update_id, summary, state, created_at)
      SELECT
        id,
        simulation_id,
        writer_update_id,
        summary,
        state,
        created_at
      FROM
        sqlitestudio_temp_table
    `);
    await tx.run(sql`DROP TABLE sqlitestudio_temp_table`);
    await tx.run(sql`PRAGMA foreign_keys = 1`);
  }
}

import type { Transaction } from "@/lib/drizzle";
import { sql } from "drizzle-orm";
import type { Migration } from "../scripts/migrate";

export default class implements Migration {
  name = "009_add_sandbox_to_simulations";

  async up(tx: Transaction) {
    await tx.run(sql`
      ALTER TABLE simulations
      ADD COLUMN sandbox INTEGER NOT NULL DEFAULT 0
    `);
  }

  async down(tx: Transaction) {
    await tx.run(sql`
      ALTER TABLE simulations
      DROP COLUMN sandbox
    `);
  }
}

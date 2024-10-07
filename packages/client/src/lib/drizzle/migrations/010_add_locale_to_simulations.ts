import type { Transaction } from "@/lib/drizzle";
import { sql } from "drizzle-orm";
import type { Migration } from "../scripts/migrate";

export default class implements Migration {
  name = "010_add_locale_to_simulations";

  async up(tx: Transaction) {
    await tx.run(sql`
      ALTER TABLE simulations
      ADD COLUMN locale TEXT NOT NULL DEFAULT 'en-US'
    `);
  }

  async down(tx: Transaction) {
    await tx.run(sql`
      ALTER TABLE simulations
      DROP COLUMN locale
    `);
  }
}

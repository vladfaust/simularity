import {
  decimal,
  pgTable,
  smallint,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const patreonPledges = pgTable("patreon_pledges", {
  /**
   * Patreon pledge ID.
   */
  id: varchar("id").primaryKey(),

  /**
   * Patreon user ID.
   */
  patronId: varchar("patron_id").notNull(),

  /**
   * Patreon campaign ID.
   */
  campaignId: varchar("campaign_id").notNull(),

  /**
   * Patreon tier ID.
   */
  tierId: varchar("tier_id").notNull(),

  /**
   * App user ID. Can be null if the user has not
   * connected their Patreon account yet.
   */
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),

  /**
   * Amount paid.
   */
  amountCents: smallint("amount_cents").notNull(),

  /**
   * Currency of the pledge.
   */
  currency: varchar("currency", { length: 3 }).notNull(),

  /**
   * Amount of credits (to be) granted.
   */
  creditsAmount: decimal("credits_amount", {
    precision: 10,
    scale: 2,
  }).notNull(),

  /**
   * Date of the pledge, defined by Patreon.
   */
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

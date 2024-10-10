import { SubscriptionTierSchema } from "@/lib/schema";
import {
  pgEnum,
  pgTable,
  serial,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { patreonPledges } from "./patreonPledges";
import { users } from "./users";

export const subscriptionTier = pgEnum("subscription_tier", [
  SubscriptionTierSchema.options[0].literal,
  SubscriptionTierSchema.options[1].literal,
]);

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),

  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "restrict" })
    .notNull(),

  tier: subscriptionTier("tier").notNull(),

  /**
   * The pledge which granted this subscription.
   */
  // TODO: Add subscription methods other than Patreon.
  patreonPledgeId: varchar("patreon_pledge_id")
    .references(() => patreonPledges.id, { onDelete: "restrict" })
    .notNull(),

  activeUntil: timestamp("active_until", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

import { MultiLocaleTextSchema } from "@/lib/schema";
import { v } from "@/lib/valibot.js";
import {
  boolean,
  integer,
  json,
  jsonb,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { subscriptionTier } from "./subscriptions";

/**
 * Map from scenario manifest version to S3 version ID.
 */
const VersionMapSchema = v.record(v.string(), v.string());

/**
 * All paths are relative to the scenario root.
 */
export const scenarios = pgTable("scenarios", {
  /**
   * Scenario's unique ID.
   */
  id: varchar("id").primaryKey(),

  /**
   * Latest scenario manifest version.
   */
  version: integer("version").notNull(),

  /**
   * Map from scenario manifest version (stringified) to S3 version ID.
   */
  versionMap: json("version_map")
    .$type<v.InferOutput<typeof VersionMapSchema>>()
    .notNull(),

  /**
   * Scenario name, localized.
   */
  name: jsonb("name")
    .$type<v.InferOutput<typeof MultiLocaleTextSchema>>()
    .notNull(),

  /**
   * Whether the scenario is NSFW.
   */
  nsfw: boolean("nsfw").notNull(),

  /**
   * Required subscription tier to access the scenario, if any.
   */
  requiredSubscriptionTier: subscriptionTier("required_subscription_tier"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

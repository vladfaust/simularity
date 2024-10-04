import { v } from "@/lib/valibot.js";
import {
  boolean,
  integer,
  json,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

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
   * Scenario name.
   */
  name: text("name").notNull(),

  /**
   * Whether the scenario is NSFW.
   */
  nsfw: boolean("nsfw").notNull(),

  /**
   * Required Patreon tier ID.
   */
  // TODO: Change to tier index?
  requiredPatreonTierId: varchar("required_patreon_tier_id"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

import { sortByKey } from "@/lib/utils";
import { relations, sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";
import { storyUpdates } from "./storyUpdates";

export const simulations = sqliteTable(
  "simulations",
  sortByKey({
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),

    scenarioId: text("scenario_id").notNull(),
    screenshot: text("screenshot"),
    headStoryUpdateId: text("head_story_update_id"),

    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),

    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  }),
);

export const simulationRelatiosn = relations(simulations, ({ one, many }) => ({
  storyUpdates: many(storyUpdates),
  headStoryUpdate: one(storyUpdates, {
    fields: [simulations.headStoryUpdateId],
    references: [storyUpdates.id],
  }),
}));

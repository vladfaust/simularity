import { sortByKey } from "@/lib/utils";
import { relations, sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";
import { checkpoints } from "./checkpoints";
import { writerUpdates } from "./writerUpdates";

export const simulations = sqliteTable(
  "simulations",
  sortByKey({
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),

    scenarioId: text("scenario_id").notNull(),
    starterEpisodeId: text("starter_episode_id"),
    currentUpdateId: text("current_writer_update_id"),

    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),

    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  }),
);

export const simulationRelatiosn = relations(simulations, ({ one, many }) => ({
  writerUpdates: many(writerUpdates),
  currentWriterUpdate: one(writerUpdates, {
    fields: [simulations.currentUpdateId],
    references: [writerUpdates.id],
  }),
  checkpoints: many(checkpoints),
}));

import { sortByKey } from "@/lib/utils";
import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { timestamp } from "./_common";
import { checkpoints } from "./checkpoints";
import { writerUpdates } from "./writerUpdates";

export const simulations = sqliteTable(
  "simulations",
  sortByKey({
    id: integer("id").primaryKey(),

    scenarioId: text("scenario_id").notNull(),
    starterEpisodeId: text("starter_episode_id"),
    currentUpdateId: integer("current_writer_update_id"),

    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at", { notNull: true, defaultNow: true }),
    updatedAt: timestamp("updated_at", { notNull: true, defaultNow: true }),
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

import { sortByKey } from "@/lib/utils";
import { relations, sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";
import { writerUpdates } from "./writerUpdates";

export const simulations = sqliteTable(
  "simulations",
  sortByKey({
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),

    scenarioId: text("scenario_id").notNull(),
    headWriterUpdateId: text("head_writer_update_id"),

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
  headWriterUpdate: one(writerUpdates, {
    fields: [simulations.headWriterUpdateId],
    references: [writerUpdates.id],
  }),
}));

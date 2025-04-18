import { type StateDto } from "@/lib/simulation/state";
import { sortByKey } from "@/lib/utils";
import { relations } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { timestamp } from "./_common";
import { simulations } from "./simulations";
import { writerUpdates } from "./writerUpdates";

// TODO: Rename to `consolidations`.
export const checkpoints = sqliteTable(
  "checkpoints",
  sortByKey({
    id: integer("id").primaryKey(),

    /**
     * ID of the simulation this checkpoint is created from.
     */
    simulationId: integer("simulation_id")
      .references(() => simulations.id, { onDelete: "cascade" })
      .notNull(),

    /**
     * ID of the writer update this checkpoint is created upon, `null` for root.
     */
    writerUpdateId: integer("writer_update_id").references(
      () => writerUpdates.id,
      { onDelete: "cascade" },
    ),

    summary: text("summary"),
    state: text("state", { mode: "json" }).$type<StateDto>(),

    createdAt: timestamp("created_at", { notNull: true, defaultNow: true }),
  }),
  (table) => ({
    unique: uniqueIndex("checkpoints_unique_idx").on(
      table.simulationId,
      table.writerUpdateId,
    ),
  }),
);

export const checkpointRelatiosn = relations(checkpoints, ({ one }) => ({
  simulation: one(simulations, {
    fields: [checkpoints.simulationId],
    references: [simulations.id],
  }),
  writerUpdate: one(writerUpdates, {
    fields: [checkpoints.writerUpdateId],
    references: [writerUpdates.id],
  }),
}));

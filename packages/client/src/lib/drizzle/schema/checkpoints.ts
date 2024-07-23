import { StateDto } from "@/lib/simulation/state";
import { sortByKey } from "@/lib/utils";
import { relations, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { writerUpdates } from "./writerUpdates";

export const checkpoints = sqliteTable(
  "checkpoints",
  sortByKey({
    id: integer("id").primaryKey(),

    /**
     * The ID of the writer update that this checkpoint is created from.
     */
    writerUpdateId: text("writer_update_id")
      .references(() => writerUpdates.id, { onDelete: "cascade" })
      .notNull(),

    summary: text("summary"),
    state: text("state", { mode: "json" }).$type<StateDto>().notNull(),

    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  }),
);

export const checkpointRelatiosn = relations(checkpoints, ({ one }) => ({
  writerUpdate: one(writerUpdates, {
    fields: [checkpoints.writerUpdateId],
    references: [writerUpdates.id],
  }),
}));

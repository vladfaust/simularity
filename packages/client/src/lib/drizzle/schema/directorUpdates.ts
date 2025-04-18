import type { StateCommand } from "@/lib/simulation/state";
import { sortByKey } from "@/lib/utils";
import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { timestamp } from "./_common";
import { llmCompletions } from "./llmCompletions";
import { writerUpdates } from "./writerUpdates";

export const directorUpdates = sqliteTable(
  "director_updates",
  sortByKey({
    id: integer("id").primaryKey(),

    writerUpdateId: integer("writer_update_id")
      .references(() => writerUpdates.id, { onDelete: "cascade" })
      .notNull(),

    llmCompletionId: integer("llm_completion_id").references(
      () => llmCompletions.id,
      { onDelete: "restrict" },
    ),

    code: text("code", { mode: "json" }).$type<StateCommand[]>().notNull(),

    /**
     * Direct Preference of the update (for DPO).
     * True if the update is preferred, false otherwise.
     */
    preference: integer("preference", { mode: "boolean" }),

    createdAt: timestamp("created_at", { notNull: true, defaultNow: true }),
  }),
);

export const directorUpdateRelatiosn = relations(
  directorUpdates,
  ({ one }) => ({
    writerUpdate: one(writerUpdates, {
      fields: [directorUpdates.writerUpdateId],
      references: [writerUpdates.id],
    }),
    completion: one(llmCompletions, {
      fields: [directorUpdates.llmCompletionId],
      references: [llmCompletions.id],
      relationName: "director_updates",
    }),
  }),
);

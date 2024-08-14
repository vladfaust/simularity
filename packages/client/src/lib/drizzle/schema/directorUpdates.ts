import { StateCommand } from "@/lib/simulation/state/commands";
import { sortByKey } from "@/lib/utils";
import { relations, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";
import { llmCompletions } from "./llmCompletions";
import { writerUpdates } from "./writerUpdates";

export const directorUpdates = sqliteTable(
  "director_updates",
  sortByKey({
    id: text("id")
      .primaryKey()
      .notNull()
      .$defaultFn(() => nanoid()),

    writerUpdateId: text("writer_update_id")
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

    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
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

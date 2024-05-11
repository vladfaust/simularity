import { sortByKey } from "@/lib/utils";
import { relations, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";
import { llamaInferences } from "./llamaInferences";
import { storyUpdates } from "./storyUpdates";

export const codeUpdates = sqliteTable(
  "code_updates",
  sortByKey({
    id: text("id")
      .primaryKey()
      .notNull()
      .$defaultFn(() => nanoid()),

    storyUpdateId: text("story_update_id")
      .references(() => storyUpdates.id, { onDelete: "cascade" })
      .notNull(),

    llamaInferenceId: integer("llama_inference_id").references(
      () => llamaInferences.id,
      { onDelete: "set null" },
    ),

    code: text("code", { mode: "text" }).notNull(),

    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  }),
);

export const codeUpdateRelatiosn = relations(codeUpdates, ({ one }) => ({
  storyUpdate: one(storyUpdates, {
    fields: [codeUpdates.storyUpdateId],
    references: [storyUpdates.id],
  }),
  llamaInference: one(llamaInferences, {
    fields: [codeUpdates.llamaInferenceId],
    references: [llamaInferences.id],
    relationName: "code_updates",
  }),
}));

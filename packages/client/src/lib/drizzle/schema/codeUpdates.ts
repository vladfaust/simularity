import { sortByKey } from "@/lib/utils";
import { relations, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";
import { llamaInferences } from "./llamaInferences";
import { scriptUpdates } from "./scriptUpdates";

export const codeUpdates = sqliteTable(
  "code_updates",
  sortByKey({
    id: text("id")
      .primaryKey()
      .notNull()
      .$defaultFn(() => nanoid()),

    scriptUpdateId: text("script_update_id")
      .references(() => scriptUpdates.id, { onDelete: "cascade" })
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
  scriptUpdate: one(scriptUpdates, {
    fields: [codeUpdates.scriptUpdateId],
    references: [scriptUpdates.id],
  }),
  llamaInference: one(llamaInferences, {
    fields: [codeUpdates.llamaInferenceId],
    references: [llamaInferences.id],
    relationName: "code_updates",
  }),
}));

import { DirectorUpdateCode } from "@/lib/ai/director";
import { sortByKey } from "@/lib/utils";
import { relations, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";
import { llamaInferences } from "./llamaInferences";
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

    llamaInferenceId: integer("llama_inference_id").references(
      () => llamaInferences.id,
      { onDelete: "set null" },
    ),

    content: text("content", { mode: "json" })
      .$type<DirectorUpdateCode>()
      .notNull(),

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
    llamaInference: one(llamaInferences, {
      fields: [directorUpdates.llamaInferenceId],
      references: [llamaInferences.id],
      relationName: "director_updates",
    }),
  }),
);

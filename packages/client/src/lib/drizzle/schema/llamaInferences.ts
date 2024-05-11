import { sortByKey } from "@/lib/utils";
import { relations, sql } from "drizzle-orm";
import { blob, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { codeUpdates } from "./codeUpdates";
import { storyUpdates } from "./storyUpdates";

export const llamaInferences = sqliteTable(
  "llama_inferences",
  sortByKey({
    id: integer("id").primaryKey(),

    modelName: text("model_name").notNull(),
    modelHash: blob("model_hash").notNull(),

    options: text("options", { mode: "json" }).notNull(), // Model-specific prompt options.
    prompt: text("prompt").notNull(),

    output: text("output"),
    error: text("error"), // Application-specific error message.
    details: text("details", { mode: "json" }),

    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),

    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  }),
);

export const llamaInferenceRelatiosn = relations(
  llamaInferences,
  ({ many }) => ({
    storyUpdates: many(storyUpdates, {
      relationName: "story_updates",
    }),
    codeUpdates: many(codeUpdates, {
      relationName: "code_updates",
    }),
  }),
);

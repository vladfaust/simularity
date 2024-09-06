import { sortByKey } from "@/lib/utils";
import { relations } from "drizzle-orm";
import { blob, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { timestamp } from "./_common";
import { llmCompletions } from "./llmCompletions";

export const llmLocalSessions = sqliteTable(
  "llm_local_sessions",
  sortByKey({
    id: integer("id").primaryKey(),
    internalId: text("internal_id").notNull(),
    modelPath: text("model_path").notNull(),

    /**
     * NOTE: Accepts `string` as a type.
     */
    modelHash: blob("model_hash").notNull(),

    contextSize: integer("context_size").notNull(),
    createdAt: timestamp("created_at", { notNull: true, defaultNow: true }),
  }),
);

export const llmLocalSessionRelatiosn = relations(
  llmLocalSessions,
  ({ many }) => ({
    completions: many(llmCompletions),
  }),
);

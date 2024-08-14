import { sortByKey } from "@/lib/utils";
import { relations, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { llmCompletions } from "./llmCompletions";

export const llmRemoteSessions = sqliteTable(
  "llm_remote_sessions",
  sortByKey({
    id: integer("id").primaryKey(),
    externalId: text("external_id").notNull(),
    baseUrl: text("base_url").notNull(),
    modelId: text("model_id").notNull(),
    contextSize: integer("context_size").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`strftime('%s', 'now')`),
  }),
);

export const llmRemoteSessionRelatiosn = relations(
  llmRemoteSessions,
  ({ many }) => ({
    completions: many(llmCompletions),
  }),
);

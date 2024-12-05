import { index, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { llmModels } from "./llmModels.js";
import { users } from "./users.js";

export const llmSessions = pgTable(
  "llm_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * For some providers, this is the session ID in the provider's system.
     */
    providerSessionId: varchar("provider_session_id"),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    modelId: varchar("model_id")
      .notNull()
      .references(() => llmModels.id, { onDelete: "restrict" }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIndex: index("llm_sessions_user_index").on(table.userId),
    modelIndex: index("llm_sessions_model_index").on(table.modelId),
    createdAtIndex: index("llm_sessions_created_at_index").on(table.createdAt),
  }),
);

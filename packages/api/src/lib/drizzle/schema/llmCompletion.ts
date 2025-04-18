import { MultiCurrencyCostSchema } from "@/lib/schema.js";
import { v } from "@/lib/valibot.js";
import {
  index,
  integer,
  json,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { llmSessions } from "./llmSessions.js";
import { llmWorkers } from "./llmWorkers.js";

export const llmCompletions = pgTable(
  "llm_completions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    sessionId: uuid("session_id")
      .notNull()
      .references(() => llmSessions.id, { onDelete: "cascade" }),

    workerId: uuid("worker_id")
      .notNull()
      .references(() => llmWorkers.id, { onDelete: "restrict" }),

    input: json("input").notNull(),

    // TODO: Rename to `queueTimeMs`.
    delayTimeMs: integer("delay_time_ms"),

    executionTimeMs: integer("execution_time_ms"),
    output: json("output"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    error: json("error"),

    /**
     * Estimated cost of the completion for the system, in multiple currencies.
     */
    estimatedCost:
      json("estimated_cost").$type<
        v.InferOutput<typeof MultiCurrencyCostSchema>
      >(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    sessionIndex: index("llm_completions_session_index").on(table.sessionId),
    workerIndex: index("llm_completions_worker_index").on(table.workerId),
    createdAtIndex: index("llm_completions_created_at_index").on(
      table.createdAt,
    ),
  }),
);

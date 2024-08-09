import { MultiCurrencyCostSchema } from "@/lib/schemas.js";
import { v } from "@/lib/valibot.js";
import {
  index,
  integer,
  json,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { llmSessions } from "./llmSessions.js";
import { llmWorkers } from "./llmWorkers.js";

export const LlmCompletionParamsSchema = v.object({
  // OpenAI-compatible.
  max_tokens: v.optional(v.number()),
  presence_penalty: v.optional(v.number()),
  stop: v.optional(v.array(v.string())),
  temperature: v.optional(v.number()),
  top_p: v.optional(v.number()),

  // vLLM-specific.
  top_k: v.optional(v.number()),
  min_p: v.optional(v.number()),
  repetition_penalty: v.optional(v.number()),
  stop_token_ids: v.optional(v.array(v.number())),
  include_stop_str_in_output: v.optional(v.boolean()),
  min_tokens: v.optional(v.number()),
  guided_grammar: v.optional(v.string()),
});

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

    params: json("params").notNull(),
    input: text("input").notNull(),
    providerExternalId: varchar("provider_external_id"),
    delayTimeMs: integer("delay_time_ms"),
    executionTimeMs: integer("execution_time_ms"),
    output: text("output"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    error: text("error"),
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

import { type CompletionOptions } from "@/lib/ai/llm/BaseLlmDriver";
import { sortByKey } from "@/lib/utils";
import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { timestamp } from "./_common";
import { directorUpdates } from "./directorUpdates";
import { llmLocalSessions } from "./llmLocalSessions";
import { llmRemoteSessions } from "./llmRemoteSessions";
import { writerUpdates } from "./writerUpdates";

export const llmCompletions = sqliteTable(
  "llm_completions",
  sortByKey({
    id: integer("id").primaryKey(),

    localSessionId: integer("local_session_id").references(
      () => llmLocalSessions.id,
      { onDelete: "restrict" },
    ),

    remoteSessionId: integer("remote_session_id").references(
      () => llmRemoteSessions.id,
      { onDelete: "restrict" },
    ),

    /** LLM completion options. */
    options: text("options", { mode: "json" })
      .$type<CompletionOptions>()
      .notNull(),

    /** The input prompt. */
    input: text("input").notNull(),

    /** Input length in tokens (calculated remotely). */
    inputLength: integer("input_length"),

    /** Resulting output. */
    output: text("output"),

    /** Output length in tokens. */
    outputLength: integer("output_length"),

    /** Completion error, if any. */
    error: text("error"),

    /** Delay time before execution, in milliseconds. */
    delayTime: integer("delay_time_ms"),

    /** Execution time in milliseconds. */
    executionTime: integer("execution_time_ms"),

    /**
     * The real time it took to complete the request, in milliseconds.
     */
    realTime: integer("real_time_ms"),

    /**
     * Credits cost of the completion, in credit cents (1/100th of a credit).
     */
    creditCost: integer("credit_cost"),

    createdAt: timestamp("created_at", { notNull: true, defaultNow: true }),
  }),
);

export const llmCompletionRelatiosn = relations(
  llmCompletions,
  ({ one, many }) => ({
    localSession: one(llmLocalSessions, {
      fields: [llmCompletions.localSessionId],
      references: [llmLocalSessions.id],
    }),
    remoteSession: one(llmRemoteSessions, {
      fields: [llmCompletions.remoteSessionId],
      references: [llmRemoteSessions.id],
    }),
    writerUpdates: many(writerUpdates, {
      relationName: "writer_updates",
    }),
    directorUpdates: many(directorUpdates, {
      relationName: "director_updates",
    }),
  }),
);

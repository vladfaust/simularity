import { MultiCurrencyCostSchema, TtsParamsSchema } from "@/lib/schema.js";
import { v } from "@/lib/valibot.js";
import {
  decimal,
  index,
  integer,
  json,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { ttsWorkers } from "./ttsWorkers.js";

// TODO: Rename to `ttsCompletions`.
export const ttsInferences = pgTable(
  "tts_inferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    workerId: uuid("worker_id")
      .notNull()
      .references(() => ttsWorkers.id, { onDelete: "restrict" }),

    params: json("params")
      .$type<v.InferOutput<typeof TtsParamsSchema>>()
      .notNull(),

    providerExternalId: varchar("provider_external_id"),
    delayTimeMs: integer("delay_time_ms"),
    executionTimeMs: integer("execution_time_ms"),
    durationMs: integer("duration_ms"),
    error: text("error"),

    /**
     * Estimated cost of the completion for the system, in multiple currencies.
     */
    estimatedCost:
      json("estimated_cost").$type<
        v.InferOutput<typeof MultiCurrencyCostSchema>
      >(),

    /**
     * How much the user was charged for this completion, in credits.
     */
    creditCost: decimal("credit_cost", { precision: 10, scale: 2 }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    workerIndex: index("tts_inferences_worker_index").on(table.workerId),
    createdAtIndex: index("tts_inferences_created_at_index").on(
      table.createdAt,
    ),
  }),
);

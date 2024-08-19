import { TtsParamsSchema } from "@/lib/runpod/endpoints/tts.js";
import { v } from "@/lib/valibot.js";
import { MultiCurrencyCostSchema } from "@simularity/api-sdk/common";
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
import { ttsWorkers } from "./ttsWorkers.js";

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
    workerIndex: index("tts_inferences_worker_index").on(table.workerId),
    createdAtIndex: index("tts_inferences_created_at_index").on(
      table.createdAt,
    ),
  }),
);

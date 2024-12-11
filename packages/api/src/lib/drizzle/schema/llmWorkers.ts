import { v } from "@/lib/valibot.js";
import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  json,
  pgEnum,
  pgTable,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { ProviderPricingModel } from "./common.js";
import { llmModels } from "./llmModels.js";

export const llmProviderId = pgEnum("llm_provider", [
  "runpod-vllm",
  "runpod-core",
]);

type ProviderMeta =
  | {
      /** Set for local RunPod workers. */
      baseUrl: string;
    }
  | {
      /** Set for remote (production) Runpod workers. */
      endpointId: string;
    };

export const llmWorkers = pgTable(
  "llm_workers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    enabled: boolean("enabled").notNull().default(false),

    modelId: varchar("model_id")
      .notNull()
      .references(() => llmModels.id, { onDelete: "restrict" }),

    providerId: llmProviderId("provider_id").notNull(),

    /**
     * Worker metadata from the provider.
     */
    providerMeta: json("provider_meta").$type<ProviderMeta>().notNull(),

    /**
     * How much the provider charges for this worker.
     */
    providerPricing:
      json("provider_pricing").$type<
        v.InferOutput<typeof ProviderPricingModel>
      >(),
  },
  (table) => ({
    mainIndex: index("llm_workers_main_index").on(
      table.modelId,
      table.providerId,
      table.enabled,
    ),
  }),
);

export const llmWorkerRelations = relations(llmWorkers, ({ one, many }) => ({
  model: one(llmModels, {
    fields: [llmWorkers.modelId],
    references: [llmModels.id],
  }),
}));

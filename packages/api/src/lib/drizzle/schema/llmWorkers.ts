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

export const llmProviderId = pgEnum("llm_provider", ["runpod"]);

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
     * Worker ID in the provider's system.
     */
    providerExternalId: varchar("provider_external_id").notNull(),

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
    externalIdIndex: index("llm_workers_provider_external_id_index").on(
      table.providerId,
      table.providerExternalId,
    ),
  }),
);

export const llmWorkerRelations = relations(llmWorkers, ({ one, many }) => ({
  model: one(llmModels, {
    fields: [llmWorkers.modelId],
    references: [llmModels.id],
  }),
}));

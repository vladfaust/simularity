import { CurrencySchema } from "@/lib/schemas.js";
import { v } from "@/lib/valibot.js";
import {
  boolean,
  index,
  json,
  pgEnum,
  pgTable,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { llmModels } from "./llmModels.js";

export const ProviderPricingModel = v.object({
  type: v.literal("perSecond"),
  currency: CurrencySchema,
  price: v.number(),
});

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

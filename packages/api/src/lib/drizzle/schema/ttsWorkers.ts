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
import { ProviderPricingModel } from "./common.js";
import { ttsModels } from "./ttsModels.js";

export const ttsProviderId = pgEnum("tts_provider", ["runpod"]);

export const ttsWorkers = pgTable(
  "tts_workers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    enabled: boolean("enabled").notNull().default(false),

    modelId: varchar("model_id")
      .notNull()
      .references(() => ttsModels.id, { onDelete: "restrict" }),

    providerId: ttsProviderId("provider_id").notNull(),

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
    mainIndex: index("tts_workers_main_index").on(
      table.modelId,
      table.providerId,
      table.enabled,
    ),
    externalIdIndex: index("tts_workers_provider_external_id_index").on(
      table.providerId,
      table.providerExternalId,
    ),
  }),
);

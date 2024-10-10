import { MultiLocaleTextSchema } from "@/lib/schema.js";
import { v } from "@/lib/valibot.js";
import { boolean, index, json, pgTable, varchar } from "drizzle-orm/pg-core";
import { subscriptionTier } from "./subscriptions";

export const ttsModels = pgTable(
  "tts_models",
  {
    id: varchar("id").primaryKey(),
    enabled: boolean("enabled").notNull().default(false),
    name: varchar("name").notNull(),
    description:
      json("description").$type<v.InferOutput<typeof MultiLocaleTextSchema>>(),
    requiredSubscriptionTier: subscriptionTier("required_subscription_tier"),
  },
  (table) => ({
    enabledIndex: index("tts_models_enabled_index").on(table.enabled),
  }),
);

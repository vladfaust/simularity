import { LlmModelTaskSchema, MultiLocaleTextSchema } from "@/lib/schema.js";
import { v } from "@/lib/valibot.js";
import {
  boolean,
  index,
  integer,
  json,
  pgEnum,
  pgTable,
  varchar,
} from "drizzle-orm/pg-core";
import { subscriptionTier } from "./subscriptions";

export const llmModelTaskEnum = pgEnum("llm_model_task", [
  LlmModelTaskSchema.options[0].literal,
  LlmModelTaskSchema.options[1].literal,
]);

export const llmModels = pgTable(
  "llm_models",
  {
    id: varchar("id").primaryKey(),
    enabled: boolean("enabled").notNull().default(false),
    task: llmModelTaskEnum("task").notNull(),
    name: varchar("name").notNull(),
    description:
      json("description").$type<v.InferOutput<typeof MultiLocaleTextSchema>>(),
    contextSize: integer("context_size").notNull(),
    requiredSubscriptionTier: subscriptionTier("required_subscription_tier"),
  },
  (table) => ({
    enabledIndex: index("llm_models_enabled_index").on(table.enabled),
  }),
);

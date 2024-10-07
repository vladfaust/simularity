import { MultiLocaleTextSchema } from "@/lib/schema.js";
import { v } from "@/lib/valibot.js";
import {
  boolean,
  decimal,
  index,
  integer,
  json,
  pgEnum,
  pgTable,
  varchar,
} from "drizzle-orm/pg-core";

export const llmModelTaskEnum = pgEnum("llm_model_task", [
  "writer",
  "director",
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

    /**
     * Model price per 1024 tokens, in credits.
     */
    creditPrice: decimal("credit_price", { precision: 10, scale: 2 }),
  },
  (table) => ({
    enabledIndex: index("llm_models_enabled_index").on(table.enabled),
  }),
);

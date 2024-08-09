import { v } from "@/lib/valibot.js";
import { MultiLangTextSchema } from "@simularity/api-sdk/common";
import {
  boolean,
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
      json("description").$type<v.InferOutput<typeof MultiLangTextSchema>>(),
    contextSize: integer("context_size").notNull(),
  },
  (table) => ({
    enabledIndex: index("llm_models_enabled_index").on(table.enabled),
  }),
);

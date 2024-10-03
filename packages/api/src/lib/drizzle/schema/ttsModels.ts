import { MultiLangTextSchema } from "@/lib/schema.js";
import { v } from "@/lib/valibot.js";
import {
  boolean,
  decimal,
  index,
  json,
  pgTable,
  varchar,
} from "drizzle-orm/pg-core";

export const ttsModels = pgTable(
  "tts_models",
  {
    id: varchar("id").primaryKey(),
    enabled: boolean("enabled").notNull().default(false),
    name: varchar("name").notNull(),
    description:
      json("description").$type<v.InferOutput<typeof MultiLangTextSchema>>(),

    /**
     * Model price per 1000 characters, in credits.
     */
    creditPrice: decimal("credit_price", { precision: 10, scale: 2 }),
  },
  (table) => ({
    enabledIndex: index("tts_models_enabled_index").on(table.enabled),
  }),
);

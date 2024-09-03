import { v } from "@/lib/valibot.js";
import { MultiLangTextSchema } from "@simularity/api-sdk/common";
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
     * Model price per minute of generated audio, in credits.
     */
    creditPrice: decimal("credit_price", { precision: 10, scale: 2 }),
  },
  (table) => ({
    enabledIndex: index("tts_models_enabled_index").on(table.enabled),
  }),
);

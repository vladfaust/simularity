import { relations } from "drizzle-orm";
import { pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { gptDecodings } from "./gptDecodes.js";

export const gptSessions = pgTable("gpt_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  inferenceNodeId: varchar("inference_node_id").notNull(),
  model: varchar("model").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const gptSessionRelations = relations(gptSessions, ({ one, many }) => ({
  decodes: many(gptDecodings),
}));

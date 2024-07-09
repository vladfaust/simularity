import { relations } from "drizzle-orm";
import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { gptDecodings } from "./gptDecodes.js";
import { gptResets } from "./gptResets.js";

export const gptSessions = pgTable("gpt_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  inferenceNodeId: varchar("inference_node_id").notNull(),

  /**
   * The ID of the session on the inference node.
   */
  inferenceNodeSessionId: integer("inference_node_session_id").notNull(),

  model: varchar("model").notNull(),
  initialPrompt: text("initial_prompt"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const gptSessionRelations = relations(gptSessions, ({ one, many }) => ({
  decodes: many(gptDecodings),
  resets: many(gptResets),
}));

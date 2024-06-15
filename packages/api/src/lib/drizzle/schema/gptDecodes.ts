import { relations } from "drizzle-orm";
import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { gptSessions } from "./gptSessions.js";

export const gptDecodings = pgTable("gpt_decodings", {
  id: uuid("id").primaryKey().defaultRandom(),

  sessionId: uuid("session_id")
    .notNull()
    .references(() => gptSessions.id, { onDelete: "cascade" }),

  prompt: text("prompt").notNull(),

  /** Actual decoding duration, in milliseconds. */
  decodingDuration: integer("decoding_duration").notNull(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const gptDecodeRelations = relations(gptDecodings, ({ one, many }) => ({
  session: one(gptSessions, {
    fields: [gptDecodings.sessionId],
    references: [gptSessions.id],
  }),
}));

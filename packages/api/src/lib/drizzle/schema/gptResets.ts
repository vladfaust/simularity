import { relations } from "drizzle-orm";
import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { gptSessions } from "./gptSessions.js";

export const gptResets = pgTable("gpt_resets", {
  id: uuid("id").primaryKey().defaultRandom(),

  sessionId: uuid("session_id")
    .notNull()
    .references(() => gptSessions.id, { onDelete: "cascade" }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const gptResetRelations = relations(gptResets, ({ one, many }) => ({
  session: one(gptSessions, {
    fields: [gptResets.sessionId],
    references: [gptSessions.id],
  }),
}));

import { relations } from "drizzle-orm";
import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { gptSessions } from "./gptSessions.js";

export const gptCommits = pgTable("gpt_commits", {
  id: uuid("id").primaryKey().defaultRandom(),

  sessionId: uuid("session_id")
    .notNull()
    .references(() => gptSessions.id, { onDelete: "cascade" }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const gptCommitRelations = relations(gptCommits, ({ one, many }) => ({
  session: one(gptSessions, {
    fields: [gptCommits.sessionId],
    references: [gptSessions.id],
  }),
}));

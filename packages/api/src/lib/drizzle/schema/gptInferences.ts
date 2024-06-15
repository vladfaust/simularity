import { InferOptions } from "@/lib/inferenceNodeApi/infer.js";
import { v } from "@/lib/valibot.js";
import { relations } from "drizzle-orm";
import {
  integer,
  json,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { gptSessions } from "./gptSessions.js";

export const gptInferences = pgTable("gpt_inferences", {
  id: uuid("id").primaryKey().defaultRandom(),

  sessionId: uuid("session_id")
    .notNull()
    .references(() => gptSessions.id, { onDelete: "cascade" }),

  /** May be empty. */
  prompt: text("prompt"),

  /** Inference options. */
  options: json("options")
    .$type<v.InferOutput<typeof InferOptions>>()
    .notNull(),

  /** Number of evaluations (max. generated prompt size in tokens). */
  nEval: integer("n_eval").notNull(),

  /** The inference result. */
  result: text("result").notNull(),

  /** Actual inference duration, in milliseconds. */
  inferenceDuration: integer("inference_duration").notNull(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const gptInferenceRelations = relations(
  gptInferences,
  ({ one, many }) => ({
    session: one(gptSessions, {
      fields: [gptInferences.sessionId],
      references: [gptSessions.id],
    }),
  }),
);

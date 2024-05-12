import { sortByKey } from "@/lib/utils";
import { relations, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";
import { codeUpdates } from "./codeUpdates";
import { llamaInferences } from "./llamaInferences";
import { simulations } from "./simulations";

export const storyUpdates = sqliteTable(
  "story_updates",
  sortByKey({
    id: text("id")
      .primaryKey()
      .notNull()
      .$defaultFn(() => nanoid()),

    simulationId: text("simulation_id")
      .references(() => simulations.id, { onDelete: "cascade" })
      .notNull(),

    createdByPlayer: integer("created_by_player", { mode: "boolean" })
      .notNull()
      .default(false),

    // Set if this update is part of an episode.
    episodeId: text("episode_id"),
    episodeChunkIndex: integer("episode_chunk_index"),

    llamaInferenceId: integer("llama_inference_id").references(
      () => llamaInferences.id,
      { onDelete: "set null" },
    ),

    text: text("text").notNull(),

    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  }),
);

export const storyUpdateRelatiosn = relations(
  storyUpdates,
  ({ one, many }) => ({
    simulation: one(simulations, {
      fields: [storyUpdates.simulationId],
      references: [simulations.id],
    }),
    llamaInference: one(llamaInferences, {
      fields: [storyUpdates.llamaInferenceId],
      references: [llamaInferences.id],
      relationName: "story_updates",
    }),
    codeUpdates: many(codeUpdates),
  }),
);

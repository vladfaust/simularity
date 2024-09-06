import { sortByKey } from "@/lib/utils";
import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { timestamp } from "./_common";
import { checkpoints } from "./checkpoints";
import { directorUpdates } from "./directorUpdates";
import { llmCompletions } from "./llmCompletions";
import { simulations } from "./simulations";

// FIXME: `writerUpdates._` is `undefined` in runtime.
export const writerUpdatesTableName = "writer_updates";

export const writerUpdates = sqliteTable(
  writerUpdatesTableName,
  sortByKey({
    id: integer("id").primaryKey(),

    simulationId: integer("simulation_id")
      .references(() => simulations.id, { onDelete: "cascade" })
      .notNull(),

    parentUpdateId: integer("parent_update_id"),
    nextUpdateId: integer("next_update_id"),

    /**
     * The checkpoint this update is based on.
     */
    // TODO: Make non-nullable.
    checkpointId: integer("checkpoint_id").notNull(),

    /**
     * Whether this update is a checkpoint.
     */
    didConsolidate: integer("did_consolidate", { mode: "boolean" })
      .notNull()
      .default(false),

    createdByPlayer: integer("created_by_player", { mode: "boolean" })
      .notNull()
      .default(false),

    // Set if this update is part of an episode.
    episodeId: text("episode_id"),
    episodeChunkIndex: integer("episode_chunk_index"),

    llmCompletionId: integer("llm_completion_id").references(
      () => llmCompletions.id,
      { onDelete: "restrict" },
    ),

    /**
     * The character authoring this update.
     */
    characterId: text("character_id", { length: 32 }),

    /**
     * The simulation day clock when this update was created, in minutes.
     * For example, 16:20 is 16 * 60 + 20 = 980.
     */
    simulationDayClock: integer("simulation_day_clock").notNull(),

    text: text("text").notNull(),

    /**
     * Direct Preference of the update (for DPO).
     * True if the update is preferred, false otherwise.
     */
    preference: integer("preference", { mode: "boolean" }),

    createdAt: timestamp("created_at", { notNull: true, defaultNow: true }),
  }),
);

export const writerUpdateRelatiosn = relations(
  writerUpdates,
  ({ one, many }) => ({
    simulation: one(simulations, {
      fields: [writerUpdates.simulationId],
      references: [simulations.id],
    }),
    parent: one(writerUpdates, {
      fields: [writerUpdates.parentUpdateId],
      references: [writerUpdates.id],
    }),
    checkpoint: one(checkpoints, {
      fields: [writerUpdates.checkpointId],
      references: [checkpoints.id],
    }),
    completion: one(llmCompletions, {
      fields: [writerUpdates.llmCompletionId],
      references: [llmCompletions.id],
      relationName: "writer_updates",
    }),
    directorUpdates: many(directorUpdates),
  }),
);

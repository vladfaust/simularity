import { sortByKey } from "@/lib/utils";
import { relations, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";
import { codeUpdates } from "./codeUpdates";
import { llamaInferences } from "./llamaInferences";
import { simulations } from "./simulations";

// TODO: Constrain: episodeId & episodeChunkIndex must be set together.
// If they're set, llamaInferenceId must be NULL.
export const scriptUpdates = sqliteTable(
  "script_updates",
  sortByKey({
    id: text("id")
      .primaryKey()
      .notNull()
      .$defaultFn(() => nanoid()),

    simulationId: text("simulation_id")
      .references(() => simulations.id, { onDelete: "cascade" })
      .notNull(),

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

export const scriptUpdateRelatiosn = relations(
  scriptUpdates,
  ({ one, many }) => ({
    simulation: one(simulations, {
      fields: [scriptUpdates.simulationId],
      references: [simulations.id],
    }),
    llamaInference: one(llamaInferences, {
      fields: [scriptUpdates.llamaInferenceId],
      references: [llamaInferences.id],
      relationName: "script_updates",
    }),
    codeUpdates: many(codeUpdates),
  }),
);

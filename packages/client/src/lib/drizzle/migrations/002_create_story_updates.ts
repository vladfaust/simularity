import { sql } from "@/lib/utils";

export const name = "002_create_story_updates";

export function up() {
  return sql`
    CREATE TABLE story_updates (
      id TEXT PRIMARY KEY NOT NULL,
      simulation_id TEXT NOT NULL,
      episode_id TEXT,
      episode_chunk_index INTEGER,
      llama_inference_id INTEGER,
      "text" TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (simulation_id) REFERENCES simulations (id) ON DELETE CASCADE,
      FOREIGN KEY (llama_inference_id) REFERENCES llama_inferences (id) ON DELETE SET NULL,
      CHECK (
        (
          episode_id IS NULL
          AND episode_chunk_index IS NULL
        )
        OR (
          episode_id IS NOT NULL
          AND episode_chunk_index IS NOT NULL
        )
      )
    );
    --
    CREATE INDEX story_updates_simulation_id_index ON story_updates (simulation_id);
    CREATE INDEX story_updates_created_at_index ON story_updates (created_at);
  `;
}

export function down() {
  return sql`DROP TABLE script_updates; `;
}

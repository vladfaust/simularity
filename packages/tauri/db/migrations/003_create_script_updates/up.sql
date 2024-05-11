CREATE TABLE script_updates (
  id TEXT PRIMARY KEY NOT NULL,
  simulation_id TEXT NOT NULL,
  episode_id TEXT,
  episode_chunk_index INTEGER,
  llama_inference_id INTEGER,
  TEXT TEXT NOT NULL,
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
CREATE INDEX script_updates_simulation_id_index ON script_updates (simulation_id);
CREATE INDEX script_updates_created_at_index ON script_updates (created_at);

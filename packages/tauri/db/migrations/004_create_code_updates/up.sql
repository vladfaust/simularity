CREATE TABLE code_updates (
  id TEXT PRIMARY KEY NOT NULL,
  script_update_id TEXT NOT NULL,
  llama_inference_id INTEGER,
  code TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (script_update_id) REFERENCES script_updates (id) ON DELETE CASCADE,
  FOREIGN KEY (llama_inference_id) REFERENCES llama_inferences (id) ON DELETE SET NULL
);
--
CREATE INDEX code_updates_script_update_id_index ON code_updates (script_update_id);
CREATE INDEX code_updates_created_at_index ON code_updates (created_at);

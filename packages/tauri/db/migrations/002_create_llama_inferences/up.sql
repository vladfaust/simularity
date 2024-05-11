CREATE TABLE llama_inferences (
  id INTEGER PRIMARY KEY NOT NULL,
  model_name TEXT NOT NULL,
  model_hash BLOB NOT NULL,
  options TEXT NOT NULL CHECK (json_valid(options)),
  prompt TEXT NOT NULL,
  output TEXT,
  error TEXT,
  details TEXT CHECK (json_valid(details)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--
CREATE INDEX llama_inferences_model_hash_index ON llama_inferences (model_hash);

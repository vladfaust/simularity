export function up(sql) {
  return sql`
    -- Create the "llm_completions" table (PostgreSQL).
    CREATE TABLE llm_completions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
      session_id UUID NOT NULL REFERENCES llm_sessions (id) ON DELETE cascade,
      worker_id UUID NOT NULL REFERENCES llm_workers (id) ON DELETE restrict,
      params json NOT NULL,
      input TEXT NOT NULL,
      provider_external_id VARCHAR(255),
      delay_time_ms INTEGER,
      execution_time_ms INTEGER,
      output TEXT,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      error TEXT,
      estimated_cost json,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );
    -- Add an index on the "session_id" column.
    CREATE INDEX llm_completions_session_index ON llm_completions (session_id);
    -- Add an index on the "worker_id" column.
    CREATE INDEX llm_completions_worker_index ON llm_completions (worker_id);
    -- Add an index on the "created_at" column.
    CREATE INDEX llm_completions_created_at_index ON llm_completions (created_at);
    -- Add an index on the "provider_external_id" column.
    CREATE INDEX llm_completions_provider_external_id_index ON llm_completions (provider_external_id);
  `;
}

export function down(sql) {
  return sql`
    -- Drop the "llm_completions" table.
    DROP TABLE llm_completions;
  `;
}

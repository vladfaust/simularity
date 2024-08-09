export function up(sql) {
  return sql`
    -- Create the "llm_sessions" table (PostgreSQL).
    CREATE TABLE llm_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
      user_id UUID NOT NULL REFERENCES users (id) ON DELETE cascade,
      model_id VARCHAR(255) NOT NULL REFERENCES llm_models (id) ON DELETE restrict,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );
    -- Add an index on the "user_id" column.
    CREATE INDEX llm_sessions_user_id_index ON llm_sessions (user_id);
    -- Add an index on the "model_id" column.
    CREATE INDEX llm_sessions_model_id_index ON llm_sessions (model_id);
    -- Add an index on the "created_at" column.
    CREATE INDEX llm_sessions_created_at_index ON llm_sessions (created_at);
  `;
}

export function down(sql) {
  return sql`
    -- Drop the "llm_sessions" table.
    DROP TABLE llm_sessions;
  `;
}

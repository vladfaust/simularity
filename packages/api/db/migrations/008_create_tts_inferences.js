export function up(sql) {
  return sql`
    -- Create the "tts_inferences" table (PostgreSQL).
    CREATE TABLE tts_inferences (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
      worker_id UUID NOT NULL REFERENCES tts_workers (id) ON DELETE restrict,
      params json NOT NULL,
      provider_external_id VARCHAR(255),
      delay_time_ms INTEGER,
      execution_time_ms INTEGER,
      error TEXT,
      estimated_cost json,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );
    -- Add an index on the "worker_id" column.
    CREATE INDEX tts_inferences_worker_index ON tts_inferences (worker_id);
    -- Add an index on the "created_at" column.
    CREATE INDEX tts_inferences_created_at_index ON tts_inferences (created_at);
  `;
}

export function down(sql) {
  return sql`
    -- Drop the "tts_inferences" table.
    DROP TABLE tts_inferences;
  `;
}

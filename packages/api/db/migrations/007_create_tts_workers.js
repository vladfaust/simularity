export function up(sql) {
  return sql`
    -- Create the "tts_provider" enum type.
    CREATE TYPE tts_provider AS ENUM('runpod');
    -- Create the "tts_workers" table (PostgreSQL).
    CREATE TABLE tts_workers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      model_id VARCHAR(255) NOT NULL REFERENCES tts_models (id) ON DELETE restrict,
      provider_id tts_provider NOT NULL,
      provider_external_id VARCHAR(255) NOT NULL,
      provider_pricing json
    );
    -- Add an index on the "model_id", "provider_id", and "enabled" columns.
    CREATE INDEX tts_workers_main_index ON tts_workers (model_id, provider_id, enabled);
    -- Add an index on the "provider_id" and "provider_external_id" columns.
    CREATE INDEX tts_workers_provider_external_id_index ON tts_workers (provider_id, provider_external_id);
  `;
}

export function down(sql) {
  return sql`
    -- Drop the "tts_workers" table.
    DROP TABLE tts_workers;
    -- Drop the "tts_provider" enum type.
    DROP TYPE tts_provider;
  `;
}

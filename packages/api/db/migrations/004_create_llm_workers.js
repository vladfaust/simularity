export function up(sql) {
  return sql`
    -- Create the "llm_provider" enum type.
    CREATE TYPE llm_provider AS ENUM('runpod');
    -- Create the "llm_workers" table (PostgreSQL).
    CREATE TABLE llm_workers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      model_id VARCHAR(255) NOT NULL REFERENCES llm_models (id) ON DELETE restrict,
      provider_id llm_provider NOT NULL,
      provider_external_id VARCHAR(255) NOT NULL,
      provider_pricing json
    );
    -- Add an index on the "model_id", "provider_id", and "enabled" columns.
    CREATE INDEX llm_workers_main_index ON llm_workers (model_id, provider_id, enabled);
    -- Add an index on the "provider_id" and "provider_external_id" columns.
    CREATE INDEX llm_workers_provider_external_id_index ON llm_workers (provider_id, provider_external_id);
  `;
}

export function down(sql) {
  return sql`
    -- Drop the "llm_workers" table.
    DROP TABLE llm_workers;
    -- Drop the "llm_provider" enum type.
    DROP TYPE llm_provider;
  `;
}

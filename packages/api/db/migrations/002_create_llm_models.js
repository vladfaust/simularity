export function up(sql) {
  return sql`
    -- Create the "llm_model_task" enum type.
    CREATE TYPE llm_model_task AS ENUM('writer', 'director');
    -- Create the "llm_models" table (PostgreSQL).
    CREATE TABLE llm_models (
      id VARCHAR(255) PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      task llm_model_task NOT NULL,
      name VARCHAR(255) NOT NULL,
      description json NOT NULL,
      context_size INTEGER NOT NULL
    );
    -- Add an index on the "enabled" column.
    CREATE INDEX llm_models_enabled_index ON llm_models (enabled);
  `;
}

export function down(sql) {
  return sql`
    -- Drop the "llm_models" table.
    DROP TABLE llm_models;
    -- Drop the "llm_model_task" enum type.
    DROP TYPE llm_model_task;
  `;
}

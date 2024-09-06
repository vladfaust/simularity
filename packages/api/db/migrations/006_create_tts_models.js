export function up(sql) {
  return sql`
    -- Create the "tts_models" table (PostgreSQL).
    CREATE TABLE tts_models (
      id VARCHAR PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      name VARCHAR(255) NOT NULL,
      description json NOT NULL,
      credit_price DECIMAL(10, 2)
    );
    -- Add an index on the "enabled" column.
    CREATE INDEX tts_models_enabled_index ON tts_models (enabled);
  `;
}

export function down(sql) {
  return sql`
    -- Drop the "tts_models" table.
    DROP TABLE tts_models;
  `;
}

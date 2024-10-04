export function up(sql) {
  return sql`
    -- Create "scenarios" table (PostgreSQL).
    CREATE TABLE scenarios (
      id VARCHAR(255) PRIMARY KEY,
      VERSION INTEGER NOT NULL,
      version_map json NOT NULL,
      name TEXT NOT NULL,
      nsfw BOOLEAN NOT NULL,
      required_patreon_tier_id VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    -- Add "name" index.
    CREATE INDEX scenarios_name_idx ON scenarios (name);
    -- Add "nsfw" index.
    CREATE INDEX scenarios_nsfw_idx ON scenarios (nsfw);
  `;
}

export function down(sql) {
  return sql`
    -- Drop "scenarios" table.
    DROP TABLE scenarios;
  `;
}

export function up(sql) {
  return sql`
    -- Create the "releases" table (PostgreSQL).
    CREATE TABLE releases (
      id serial PRIMARY KEY,
      version_major SMALLINT NOT NULL,
      version_minor SMALLINT NOT NULL,
      version_patch SMALLINT NOT NULL,
      notes TEXT,
      platforms json NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    -- Add a unique constraint to the "releases" table.
    ALTER TABLE releases
    ADD CONSTRAINT unique_version UNIQUE (version_major, version_minor, version_patch);
  `;
}

export function down(sql) {
  return sql`
    -- Drop the "releases" table.
    DROP TABLE releases;
  `;
}

export function up(sql) {
  return sql`
    -- Create "patreon_pledges" table (PostgreSQL).
    CREATE TABLE patreon_pledges (
      id VARCHAR(255) PRIMARY KEY,
      patron_id VARCHAR(255) NOT NULL,
      campaign_id VARCHAR(255) NOT NULL,
      tier_id VARCHAR(255) NOT NULL,
      user_id UUID REFERENCES users (id) ON DELETE SET NULL,
      amount_cents SMALLINT NOT NULL,
      currency VARCHAR(3) NOT NULL,
      credits_amount DECIMAL(10, 2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );
    -- Index "patron_id".
    CREATE INDEX patreon_pledges_patron_id_idx ON patreon_pledges (patron_id);
    -- Index "user_id".
    CREATE INDEX patreon_pledges_user_id_idx ON patreon_pledges (user_id);
    -- Index "created_at".
    CREATE INDEX patreon_pledges_created_at_idx ON patreon_pledges (created_at);
  `;
}

export function down(sql) {
  return sql`
    -- Drop "patreon_pledges" table.
    DROP TABLE patreon_pledges;
  `;
}

export function up(sql) {
  return sql`
    -- Create the "oauth_accounts" table.
    CREATE TABLE oauth_accounts (
      provider_id VARCHAR(32) NOT NULL,
      external_id TEXT NOT NULL,
      user_id UUID NOT NULL REFERENCES users (id) ON DELETE cascade,
      scope TEXT NOT NULL,
      token_type VARCHAR(32) NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      access_token_expires_at TIMESTAMPTZ,
      refresh_token_expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (provider_id, external_id)
    );
  `;
}

export function down(sql) {
  return sql`
    -- Drop the "oauth_accounts" table.
    DROP TABLE oauth_accounts;
  `;
}

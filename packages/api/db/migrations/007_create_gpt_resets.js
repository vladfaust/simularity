export function up(sql) {
  return sql`
    CREATE TABLE gpt_resets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
      session_id UUID NOT NULL REFERENCES gpt_sessions (id) ON DELETE cascade,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;
}

export function down(sql) {
  return sql` DROP TABLE gpt_resets; `;
}

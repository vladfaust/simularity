export function up(sql) {
  return sql`
    CREATE TABLE gpt_commits (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
      session_id UUID NOT NULL REFERENCES gpt_sessions (id) ON DELETE cascade,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
}

export function down(sql) {
  return sql` DROP TABLE gpt_commits; `;
}

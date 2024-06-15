export function up(sql) {
  return sql`
    CREATE TABLE gpt_decodings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
      session_id UUID NOT NULL REFERENCES gpt_sessions (id) ON DELETE cascade,
      prompt TEXT NOT NULL,
      decoding_duration INT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
}

export function down(sql) {
  return sql` DROP TABLE gpt_decodings; `;
}

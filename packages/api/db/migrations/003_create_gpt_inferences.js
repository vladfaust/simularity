export function up(sql) {
  return sql`
    CREATE TABLE gpt_inferences (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
      session_id UUID NOT NULL REFERENCES gpt_sessions (id) ON DELETE cascade,
      prompt TEXT,
      options json NOT NULL,
      n_eval INT NOT NULL,
      result TEXT NOT NULL,
      inference_duration INT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
}

export function down(sql) {
  return sql` DROP TABLE gpt_inferences; `;
}

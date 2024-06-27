export function up(sql) {
  return sql`
    ALTER TABLE gpt_sessions
    ADD COLUMN initial_prompt TEXT;
  `;
}

export function down(sql) {
  return sql`
    ALTER TABLE gpt_sessions
    DROP COLUMN initial_prompt;
  `;
}

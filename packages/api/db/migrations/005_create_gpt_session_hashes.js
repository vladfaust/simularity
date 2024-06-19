export function up(sql) {
  return sql` CREATE TABLE gpt_session_hashes (hash bytea PRIMARY KEY); `;
}

export function down(sql) {
  return sql` DROP TABLE gpt_session_hashes;`;
}

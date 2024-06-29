export function up(sql) {
  return sql`
    ALTER TABLE gpt_inferences
    ADD COLUMN aborted BOOLEAN NOT NULL DEFAULT FALSE;
    -- Remove the default value
    ALTER TABLE gpt_inferences
    ALTER COLUMN aborted
    DROP DEFAULT;
  `;
}

export function down(sql) {
  return sql`
    ALTER TABLE gpt_inferences
    DROP COLUMN aborted;
  `;
}

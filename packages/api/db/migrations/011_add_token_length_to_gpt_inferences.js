export function up(sql) {
  return sql`
    -- Add token_length to gpt_inferences.
    ALTER TABLE gpt_inferences
    ADD COLUMN token_length INTEGER NOT NULL DEFAULT 0;
    -- Drop the default value.
    ALTER TABLE gpt_inferences
    ALTER COLUMN token_length
    DROP DEFAULT;
  `;
}

export function down(sql) {
  return sql`
    -- Remove token_length from gpt_inferences.
    ALTER TABLE gpt_inferences
    DROP COLUMN token_length;
  `;
}

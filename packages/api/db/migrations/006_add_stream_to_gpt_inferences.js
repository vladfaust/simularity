export function up(sql) {
  return sql`
    -- Add a new column to the gpt_inferences table.
    ALTER TABLE gpt_inferences
    ADD COLUMN stream BOOLEAN NOT NULL DEFAULT FALSE;
    -- Drop the default constraint.
    ALTER TABLE gpt_inferences
    ALTER COLUMN stream
    DROP DEFAULT;
  `;
}

export function down(sql) {
  return sql`
    -- Drop the new column from the gpt_inferences table.
    ALTER TABLE gpt_inferences
    DROP COLUMN stream;
  `;
}

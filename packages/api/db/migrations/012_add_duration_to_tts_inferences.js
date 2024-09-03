export function up(sql) {
  return sql`
    -- Add "duration_ms" column to "tts_inferences" table.
    ALTER TABLE tts_inferences
    ADD COLUMN duration_ms INTEGER;
  `;
}

export function down(sql) {
  return sql`
    -- Remove "duration_ms" column from "tts_inferences" table.
    ALTER TABLE tts_inferences
    DROP COLUMN duration_ms;
  `;
}

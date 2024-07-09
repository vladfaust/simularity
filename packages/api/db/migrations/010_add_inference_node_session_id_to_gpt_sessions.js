export function up(sql) {
  return sql`
    -- Add inference_node_session_id to gpt_sessions
    -- (default for migration purposes only).
    ALTER TABLE gpt_sessions
    ADD COLUMN inference_node_session_id INTEGER DEFAULT 0 NOT NULL;
    -- Drop the default value.
    ALTER TABLE gpt_sessions
    ALTER COLUMN inference_node_session_id
    DROP DEFAULT;
  `;
}

export function down(sql) {
  return sql`
    -- Remove inference_node_session_id from gpt_sessions.
    ALTER TABLE gpt_sessions
    DROP COLUMN inference_node_session_id;
  `;
}

export function up(sql) {
  return sql`
    -- In "llm_provider" enum, change 'runpod' value to 'runpod-vllm'.
    ALTER TYPE llm_provider
    RENAME value 'runpod' TO 'runpod-vllm';
    -- Add 'runpod-core' to the "llm_provider" enum.
    ALTER TYPE llm_provider
    ADD value 'runpod-core';
    -- Add "provider_session_id" column to the "llm_sessions" table.
    ALTER TABLE llm_sessions
    ADD COLUMN provider_session_id VARCHAR;
  `;
}

export function down(sql) {
  throw new Error("This migration cannot be undone");
}

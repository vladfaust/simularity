export function up(sql) {
  return sql`
    CREATE TABLE gpt_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
      inference_node_id VARCHAR(255) NOT NULL,
      model VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ
    );
  `;
}

export function down(sql) {
  return sql` DROP TABLE gpt_sessions; `;
}

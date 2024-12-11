export function up(sql) {
  console.warn(
    `⚠️ After this migration, fill the "llm_workers"."provider_meta" columns. All workers are disabled.`,
  );

  return sql`
    -- Drop "provider_external_id" from "llm_workers" table.
    ALTER TABLE llm_workers
    DROP COLUMN provider_external_id;
    -- Add "provider_meta" JSON column to "llm_workers" table.
    ALTER TABLE llm_workers
    ADD COLUMN provider_meta json NOT NULL DEFAULT '{}';
    -- Remove default value from "provider_meta" column.
    ALTER TABLE llm_workers
    ALTER COLUMN provider_meta
    DROP DEFAULT;
    -- Set "enabled" to false for all workers.
    UPDATE llm_workers
    SET
      enabled = FALSE;
  `;
}

export function down(sql) {
  console.warn(
    `⚠️ After this migration, fill "llm_workers"."provider_external_id". All workers are disabled.`,
  );

  return sql`
    -- Drop "provider_meta" from "llm_workers" table.
    ALTER TABLE llm_workers
    DROP COLUMN provider_meta;
    -- Add "provider_external_id" column to "llm_workers" table.
    ALTER TABLE llm_workers
    ADD COLUMN provider_external_id VARCHAR NOT NULL DEFAULT '';
    -- Remove default value from "provider_external_id" column.
    ALTER TABLE llm_workers
    ALTER COLUMN provider_external_id
    DROP DEFAULT;
    -- Set "enabled" to false for all workers.
    UPDATE llm_workers
    SET
      enabled = FALSE;
  `;
}

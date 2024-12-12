export function up(sql) {
  return sql`
    -- Before: "llm_completions" has "params"::json & "input"::text columns.
    -- After: "llm_completions" has "input"::json column with {"prompt": input, "params": params} values.
    -- Start by creating a temporary column to hold the new values.
    ALTER TABLE llm_completions
    ADD COLUMN input_temp json;
    -- Copy the old values into the new column.
    UPDATE llm_completions
    SET
      input_temp = json_build_object('prompt', input, 'params', params);
    -- Drop the old columns.
    ALTER TABLE llm_completions
    DROP COLUMN input,
    DROP COLUMN params;
    -- Rename the new column to the old column names.
    ALTER TABLE llm_completions
    RENAME COLUMN input_temp TO input;
    -- Set the new column to not allow null values.
    ALTER TABLE llm_completions
    ALTER COLUMN input
    SET NOT NULL;
    --
    -- Before: "llm_completions" has "output"::text column.
    -- After: "llm_completions" has "output"::json column with {"text": output} values.
    -- Start by creating a temporary column to hold the new values.
    ALTER TABLE llm_completions
    ADD COLUMN output_temp json;
    -- Copy the old values into the new column.
    UPDATE llm_completions
    SET
      output_temp = json_build_object('text', output);
    -- Drop the old columns.
    ALTER TABLE llm_completions
    DROP COLUMN output;
    -- Rename the new column to the old column names.
    ALTER TABLE llm_completions
    RENAME COLUMN output_temp TO output;
    --
    -- Before: "llm_completions" has "error"::text column.
    -- After: "llm_completions" has "error"::json column with {"message": error} values.
    -- Start by creating a temporary column to hold the new values.
    ALTER TABLE llm_completions
    ADD COLUMN error_temp json;
    -- Copy the old values into the new column.
    UPDATE llm_completions
    SET
      error_temp = json_build_object('message', error);
    -- Drop the old columns.
    ALTER TABLE llm_completions
    DROP COLUMN error;
    -- Rename the new column to the old column names.
    ALTER TABLE llm_completions
    RENAME COLUMN error_temp TO error;
  `;
}

export function down(sql) {
  return sql`
    -- Revert the changes made in the "up" migration.
    --
    -- Before: "llm_completions" has "error"::json column with {"message": error} values.
    -- After: "llm_completions" has "error"::text column.
    -- Start by creating a temporary column to hold the new values.
    ALTER TABLE llm_completions
    ADD COLUMN error_temp TEXT;
    -- Copy the old values into the new column.
    UPDATE llm_completions
    SET
      error_temp = error ->> 'message';
    -- Drop the old columns.
    ALTER TABLE llm_completions
    DROP COLUMN error;
    -- Rename the new column to the old column names.
    ALTER TABLE llm_completions
    RENAME COLUMN error_temp TO error;
    --
    -- Before: "llm_completions" has "output"::json column with {"text": output} values.
    -- After: "llm_completions" has "output"::text column.
    -- Start by creating a temporary column to hold the new values.
    ALTER TABLE llm_completions
    ADD COLUMN output_temp TEXT;
    -- Copy the old values into the new column.
    UPDATE llm_completions
    SET
      output_temp = output ->> 'text';
    -- Drop the old columns.
    ALTER TABLE llm_completions
    DROP COLUMN output;
    -- Rename the new column to the old column names.
    ALTER TABLE llm_completions
    RENAME COLUMN output_temp TO output;
    --
    -- Before: "llm_completions" has "input"::json column with {"prompt": input, "params": params} values.
    -- After: "llm_completions" has "params"::json & "input"::text columns.
    -- Start by creating a temporary column to hold the new values.
    ALTER TABLE llm_completions
    ADD COLUMN input_temp TEXT,
    ADD COLUMN params_temp json;
    -- Copy the old values into the new column.
    UPDATE llm_completions
    SET
      input_temp = input ->> 'prompt',
      params_temp = input -> 'params';
    -- Drop the old columns.
    ALTER TABLE llm_completions
    DROP COLUMN input;
    -- Rename the new column to the old column names.
    ALTER TABLE llm_completions
    RENAME COLUMN input_temp TO input,
    RENAME COLUMN params_temp TO params;
  `;
}

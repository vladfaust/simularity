export function up(sql) {
  return sql`
    -- Add "credit_balance" column to "users" table.
    ALTER TABLE users
    ADD COLUMN credit_balance DECIMAL(10, 2) DEFAULT 0;
    -- Add "credit_price" column to "llm_models" table.
    ALTER TABLE llm_models
    ADD COLUMN credit_price DECIMAL(10, 2);
    -- Add "credit_cost" column to "llm_completions" table.
    ALTER TABLE llm_completions
    ADD COLUMN credit_cost DECIMAL(10, 2);
    -- Add "credit_price" column to "tts_models" table.
    ALTER TABLE tts_models
    ADD COLUMN credit_price DECIMAL(10, 2);
    -- Add "credit_cost" column to "tts_inferences" table.
    ALTER TABLE tts_inferences
    ADD COLUMN credit_cost DECIMAL(10, 2);
  `;
}

export function down(sql) {
  return sql`
    -- Remove "credit_balance" column from "users" table.
    ALTER TABLE users
    DROP COLUMN credit_balance;
    -- Remove "credit_price" column from "llm_models" table.
    ALTER TABLE llm_models
    DROP COLUMN credit_price;
    -- Remove "credit_cost" column from "llm_completions" table.
    ALTER TABLE llm_completions
    DROP COLUMN credit_cost;
    -- Remove "credit_price" column from "tts_models" table.
    ALTER TABLE tts_models
    DROP COLUMN credit_price;
    -- Remove "credit_cost" column from "tts_inferences" table.
    ALTER TABLE tts_inferences
    DROP COLUMN credit_cost;
  `;
}

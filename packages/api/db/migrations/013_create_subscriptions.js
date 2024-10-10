export function up(sql) {
  return sql`
    -- Create "subscription_tier" enum type.
    CREATE TYPE subscription_tier AS ENUM('basic', 'premium');
    -- Drop "credit_cost" column from "llm_completions" table.
    ALTER TABLE llm_completions
    DROP COLUMN credit_cost;
    -- Drop "credit_price" column from "llm_models" table.
    ALTER TABLE llm_models
    DROP COLUMN credit_price;
    -- Add "required_subscription_tier" to "llm_models" table.
    ALTER TABLE llm_models
    ADD COLUMN required_subscription_tier subscription_tier;
    -- Drop "credit_cost" column from "tts_inferences" table.
    ALTER TABLE tts_inferences
    DROP COLUMN credit_cost;
    -- Drop "credit_price" column from "tts_models" table.
    ALTER TABLE tts_models
    DROP COLUMN credit_price;
    -- Add "required_subscription_tier" to "tts_models" table.
    ALTER TABLE tts_models
    ADD COLUMN required_subscription_tier subscription_tier;
    -- Drop "credits_amount" column from "patreon_pledges" table.
    ALTER TABLE patreon_pledges
    DROP COLUMN credits_amount;
    -- Drop "required_patreon_tier_id" from "scenarios" table.
    ALTER TABLE scenarios
    DROP COLUMN required_patreon_tier_id;
    -- Add "required_subscription_tier" to "scenarios" table.
    ALTER TABLE scenarios
    ADD COLUMN required_subscription_tier subscription_tier;
    -- Drop "credit_balance" column from "users" table.
    ALTER TABLE users
    DROP COLUMN credit_balance;
    -- Create "subscriptions" table.
    CREATE TABLE subscriptions (
      id serial PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users (id) ON DELETE restrict,
      tier subscription_tier NOT NULL,
      patreon_pledge_id VARCHAR NOT NULL REFERENCES patreon_pledges (id) ON DELETE restrict,
      active_until TIMESTAMP WITH TIME ZONE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL
    );
    -- Add index to "subscriptions"."user_id" column.
    CREATE INDEX subscriptions_user_id ON subscriptions (user_id);
    -- Add index to "subscriptions"."tier" column.
    CREATE INDEX subscriptions_tier ON subscriptions (tier);
    -- Add index to "subscriptions"."patreon_pledge_id" column.
    CREATE INDEX subscriptions_patreon_pledge_id ON subscriptions (patreon_pledge_id);
    -- Add index to "subscriptions"."active_until" column.
    CREATE INDEX subscriptions_active_until ON subscriptions (active_until);
  `;
}

export function down(sql) {
  // TIP: Credits is `DECIMAL(10, 2)` in PostgreSQL.
  return sql`
    -- Drop "subscriptions" table.
    DROP TABLE subscriptions;
    -- Add "credit_balance" column to "users" table.
    ALTER TABLE users
    ADD COLUMN credit_balance DECIMAL(10, 2) NOT NULL DEFAULT 0;
    -- Drop "required_subscription_tier" from "scenarios" table.
    ALTER TABLE scenarios
    DROP COLUMN required_subscription_tier;
    -- Add "required_patreon_tier_id" to "scenarios" table.
    ALTER TABLE scenarios
    ADD COLUMN required_patreon_tier_id VARCHAR(255),
    -- Drop "credits_amount" column from "patreon_pledges" table.
    ALTER TABLE patreon_pledges
    ADD COLUMN credits_amount DECIMAL(10, 2) NOT NULL DEFAULT 0;
    -- Drop "required_subscription_tier" from "tts_models" table.
    ALTER TABLE tts_models
    DROP COLUMN required_subscription_tier;
    -- Add "credit_price" column to "tts_models" table.
    ALTER TABLE tts_models
    ADD COLUMN credit_price DECIMAL(10, 2);
    -- Add "credit_cost" column to "tts_inferences" table.
    ALTER TABLE tts_inferences
    ADD COLUMN credit_cost DECIMAL(10, 2);
    -- Drop "required_subscription_tier" from "llm_models" table.
    ALTER TABLE llm_models
    DROP COLUMN required_subscription_tier;
    -- Add "credit_price" column to "llm_models" table.
    ALTER TABLE llm_models
    ADD COLUMN credit_price DECIMAL(10, 2);
    -- Add "credit_cost" column to "llm_completions" table.
    ALTER TABLE llm_completions
    ADD COLUMN credit_cost DECIMAL(10, 2);
    -- Drop "subscription_tier" enum type.
    DROP TYPE subscription_tier;
  `;
}

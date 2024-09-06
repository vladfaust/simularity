export function up(sql) {
  return sql`
    -- Create the "users" table (PostgreSQL).
    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
      email VARCHAR(255) UNIQUE,
      credit_balance DECIMAL(10, 2) DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );
    -- Add an index on the "email" column.
    CREATE INDEX users_email_index ON users (email);
    -- Add an index on the "created_at" column.
    CREATE INDEX users_created_at_index ON users (created_at);
  `;
}

export function down(sql) {
  return sql`
    -- Drop the "users" table.
    DROP TABLE users;
  `;
}

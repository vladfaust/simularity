export function up(sql) {
  return sql`
    -- Create the "users" table (PostgreSQL).
    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
      username VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );
    -- Add an index on the "username" column.
    CREATE INDEX users_username_index ON users (username);
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

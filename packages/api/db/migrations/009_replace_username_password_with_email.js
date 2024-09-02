export function up(sql) {
  return sql`
    -- Drop the "username" and "password_hash" columns from the "users" table.
    ALTER TABLE users
    DROP COLUMN username;
    ALTER TABLE users
    DROP COLUMN password_hash;
    -- Add the "email" column to the "users" table.
    ALTER TABLE users
    ADD COLUMN email VARCHAR(255) UNIQUE;
  `;
}

export function down(sql) {
  return sql`
    -- Drop the "email" column from the "users" table.
    ALTER TABLE users
    DROP COLUMN email;
    -- Add the "username" and "password_hash" columns to the "users" table.
    ALTER TABLE users
    ADD COLUMN username VARCHAR(255) UNIQUE NOT NULL;
    ALTER TABLE users
    ADD COLUMN password_hash VARCHAR(255) NOT NULL;
  `;
}

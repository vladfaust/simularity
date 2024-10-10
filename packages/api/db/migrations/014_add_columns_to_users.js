export function up(sql) {
  return sql`
    -- Add "username" column to "users" table.
    ALTER TABLE users
    ADD COLUMN username VARCHAR(255) UNIQUE;
    -- Add "bio" column to "users" table.
    ALTER TABLE users
    ADD COLUMN bio TEXT NOT NULL DEFAULT '';
    -- Add "pfp_hash" column to "users" table.
    ALTER TABLE users
    ADD COLUMN pfp_hash bytea;
    -- Add "pfp_extension" column to "users" table.
    ALTER TABLE users
    ADD COLUMN pfp_extension VARCHAR(255);
    -- Add "bgp_hash" column to "users" table.
    ALTER TABLE users
    ADD COLUMN bgp_hash bytea;
    -- Add "bgp_extension" column to "users" table.
    ALTER TABLE users
    ADD COLUMN bgp_extension VARCHAR(255);
  `;
}

export function down(sql) {
  return sql`
    -- Remove "bgp_extension" column from "users" table.
    ALTER TABLE users
    DROP COLUMN bgp_extension;
    -- Remove "bgp_hash" column from "users" table.
    ALTER TABLE users
    DROP COLUMN bgp_hash;
    -- Remove "pfp_extension" column from "users" table.
    ALTER TABLE users
    DROP COLUMN pfp_extension;
    -- Remove "pfp_hash" column from "users" table.
    ALTER TABLE users
    DROP COLUMN pfp_hash;
    -- Remove "bio" column from "users" table.
    ALTER TABLE users
    DROP COLUMN bio;
    -- Remove "username" column from "users" table.
    ALTER TABLE users
    DROP COLUMN username;
  `;
}

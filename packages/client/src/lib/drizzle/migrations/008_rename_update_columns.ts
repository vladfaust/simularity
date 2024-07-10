import { sql } from "@/lib/utils";

export const name = "008_rename_update_columns";

export function up() {
  return sql`
    -- Rename "director_updates"."content" column to "code".
    ALTER TABLE director_updates
    RENAME COLUMN content TO code;
    -- Rename "writer_updates"."content" column to "text".
    ALTER TABLE writer_updates
    RENAME COLUMN content TO "text";
  `;
}

export function down() {
  return sql`
    -- Rename "writer_updates"."text" column to "content".
    ALTER TABLE writer_updates
    RENAME COLUMN "text" TO content;
    -- Rename "director_updates"."code" column to "content".
    ALTER TABLE director_updates
    RENAME COLUMN code TO content;
  `;
}

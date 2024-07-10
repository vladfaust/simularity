import { sql } from "@/lib/utils";

export const name = "007_rename_updates";

export function up() {
  return sql`
    -- Rename "story_updates" table to "writer_updates".
    ALTER TABLE story_updates
    RENAME TO writer_updates;
    -- Rename "writer_updates"."text" column to "content".
    ALTER TABLE writer_updates
    RENAME COLUMN "text" TO content;
    -- Rename "code_updates" table to "director_updates".
    ALTER TABLE code_updates
    RENAME TO director_updates;
    -- Rename "director_updates"."story_update_id" column to "writer_update_id".
    ALTER TABLE director_updates
    RENAME COLUMN story_update_id TO writer_update_id;
    -- Rename "director_updates"."code" column to "content".
    ALTER TABLE director_updates
    RENAME COLUMN code TO content;
    -- Rename "simulations"."head_story_update_id" column to "head_writer_update_id".
    ALTER TABLE simulations
    RENAME COLUMN head_story_update_id TO head_writer_update_id;
  `;
}

export function down() {
  return sql`
    -- Rename "simulations"."head_writer_update_id" column to "head_story_update_id".
    ALTER TABLE simulations
    RENAME COLUMN head_writer_update_id TO head_story_update_id;
    -- Rename "director_updates"."content" column to "code".
    ALTER TABLE director_updates
    RENAME COLUMN content TO code;
    -- Rename "director_updates"."writer_update_id" column to "story_update_id".
    ALTER TABLE director_updates
    RENAME COLUMN writer_update_id TO story_update_id;
    -- Rename "director_updates" table to "code_updates".
    ALTER TABLE director_updates
    RENAME TO code_updates;
    -- Rename "writer_updates"."content" column to "text".
    ALTER TABLE writer_updates
    RENAME COLUMN content TO "text";
    -- Rename "writer_updates" table to "story_updates".
    ALTER TABLE writer_updates
    RENAME TO story_updates;
  `;
}

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

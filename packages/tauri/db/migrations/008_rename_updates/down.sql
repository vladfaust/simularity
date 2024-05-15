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

-- Rename "director_updates"."content" column to "code".
ALTER TABLE director_updates
RENAME COLUMN content TO code;
-- Rename "writer_updates"."content" column to "text".
ALTER TABLE writer_updates
RENAME COLUMN content TO "text";

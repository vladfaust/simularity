-- Rename "writer_updates"."text" column to "content".
ALTER TABLE writer_updates
RENAME COLUMN "text" TO content;
-- Rename "director_updates"."code" column to "content".
ALTER TABLE director_updates
RENAME COLUMN code TO content;

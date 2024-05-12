-- Add "created_by_player" column to "story_updates" table.
ALTER TABLE story_updates
ADD COLUMN created_by_player INTEGER NOT NULL DEFAULT 0;

-- Revert: -- Add "created_by_player" column to "story_updates" table.
ALTER TABLE story_updates
DROP COLUMN created_by_player;

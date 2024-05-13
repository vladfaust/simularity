-- Add "head_story_update_id" to "simulations" table
ALTER TABLE simulations
ADD COLUMN head_story_update_id INTEGER;
--
-- Add "parent_update_id" to "story_updates" table
ALTER TABLE story_updates
ADD COLUMN parent_update_id TEXT;

ALTER TABLE story_updates
DROP COLUMN parent_update_id;
--
ALTER TABLE simulations
DROP COLUMN head_story_update_id;

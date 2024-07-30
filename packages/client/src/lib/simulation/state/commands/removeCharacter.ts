import { v } from "@/lib/valibot";

/**
 * Remove a character from the scene.
 */
export const RemoveCharacterSchema = v.object({
  name: v.literal("remove_character"),
  args: v.object({
    /**
     * The ID of the character to remove.
     */
    characterId: v.string(),
  }),
});

import { v } from "@/lib/valibot";

/**
 * Remove a character from the stage.
 */
export const RemoveCharacterSchema = v.object({
  name: v.literal("removeCharacter"),
  args: v.object({
    /**
     * The ID of the character to remove.
     */
    characterId: v.string(),
  }),
});

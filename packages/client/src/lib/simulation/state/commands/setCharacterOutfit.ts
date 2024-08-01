import { v } from "@/lib/valibot";

/**
 * Set outfit of a character.
 */
export const SetCharacterOutfitSchema = v.object({
  name: v.literal("setCharacterOutfit"),
  args: v.object({
    /**
     * The ID of the character to update.
     */
    characterId: v.string(),

    /**
     * The ID of the outfit to set.
     */
    outfitId: v.string(),
  }),
});

import { v } from "@/lib/valibot";

/**
 * Set outfit of a character.
 */
export const SetOutfitSchema = v.object({
  name: v.literal("setOutfit"),
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

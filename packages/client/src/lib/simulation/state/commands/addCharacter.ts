import { v } from "@/lib/valibot";

/**
 * Add a character to the scene.
 */
export const AddCharacterSchema = v.object({
  name: v.literal("add_character"),
  args: v.object({
    /**
     * The ID of the character to add.
     */
    characterId: v.string(),

    /**
     * The ID of the outfit to use.
     */
    outfitId: v.string(),

    /**
     * The ID of the expression to use.
     */
    expressionId: v.string(),
  }),
});

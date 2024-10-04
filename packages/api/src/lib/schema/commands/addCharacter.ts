import * as v from "valibot";

/**
 * Add a character to the stage.
 */
export const AddCharacterSchema = v.object({
  name: v.literal("addCharacter"),
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

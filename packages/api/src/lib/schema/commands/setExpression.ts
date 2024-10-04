import * as v from "valibot";

/**
 * Set expression of a character.
 */
export const SetExpressionSchema = v.object({
  name: v.literal("setExpression"),
  args: v.object({
    /**
     * The ID of the character to update.
     */
    characterId: v.string(),

    /**
     * The ID of the expression to set.
     */
    expressionId: v.string(),
  }),
});

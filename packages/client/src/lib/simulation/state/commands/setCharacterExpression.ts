import { v } from "@/lib/valibot";

/**
 * Set expression of a character.
 */
export const SetCharacterExpressionSchema = v.object({
  name: v.literal("setCharacterExpression"),
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

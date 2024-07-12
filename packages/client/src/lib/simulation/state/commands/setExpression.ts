import { z } from "zod";

export const SetExpressionSchema = z
  .object({
    name: z.literal("set_expression"),
    args: z.object({
      characterId: z.string().describe("The ID of the character to update."),
      expressionId: z.string().describe("The ID of the expression to set."),
    }),
  })
  .describe("Set expression of a character.");

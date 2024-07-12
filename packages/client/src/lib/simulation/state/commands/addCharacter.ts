import { z } from "zod";

export const AddCharacterSchema = z
  .object({
    name: z.literal("add_character"),
    args: z.object({
      characterId: z.string().describe("The ID of the character to add."),
      outfitId: z.string().describe("The ID of the outfit to use."),
      expressionId: z.string().describe("The ID of the expression to use."),
    }),
  })
  .describe("Add a character to the scene.");

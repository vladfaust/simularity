import { z } from "zod";

export const RemoveCharacterSchema = z
  .object({
    name: z.literal("remove_character"),
    args: z.object({
      characterId: z.string().describe("The ID of the character to remove."),
    }),
  })
  .describe("Remove a character from the scene.");

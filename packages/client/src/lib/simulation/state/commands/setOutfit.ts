import { z } from "zod";

export const SetOutfitSchema = z
  .object({
    name: z.literal("set_outfit"),
    args: z.object({
      characterId: z.string().describe("The ID of the character to update."),
      outfitId: z.string().describe("The ID of the outfit to set."),
    }),
  })
  .describe("Set outfit of a character.");

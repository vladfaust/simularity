import { z } from "zod";

export const SetSceneSchema = z
  .object({
    name: z.literal("set_scene"),
    args: z.object({
      sceneId: z
        .string()
        .nullable()
        .describe("A fully qualified ID of the scene to set."),
      clear: z
        .boolean()
        .describe(
          `If "clear" is \`true\`, remove all characters from the scene. If "clear" is \`false\`, keep the characters in the scene and update the scene background only.`,
        ),
    }),
  })
  .describe("Set the scene to specified sceneId.");

import { v } from "@/lib/valibot";

/**
 * Set the scene to specified scene ID.
 */
export const SetSceneSchema = v.object({
  name: v.literal("setScene"),
  args: v.object({
    /**
     * A string that identifies the scene.
     */
    sceneId: v.nullable(v.string()),

    /**
     * If true, remove all characters from the stage. Otherwise, keep them.
     */
    clearStage: v.boolean(),
  }),
});

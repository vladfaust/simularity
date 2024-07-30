import { v } from "@/lib/valibot";

/**
 * Set the scene to specified sceneId.
 */
export const SetSceneSchema = v.object({
  name: v.literal("set_scene"),
  args: v.object({
    /**
     * A fully qualified ID of the scene to set.
     */
    sceneId: v.nullable(v.string()),

    /**
     * If "clear" is `true`, remove all characters from the scene.
     * If "clear" is `false`, keep the characters in the scene
     * and update the scene background only.
     */
    clear: v.boolean(),
  }),
});

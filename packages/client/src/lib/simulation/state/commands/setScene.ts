import { v } from "@/lib/valibot";

/**
 * Set the scene to specified scene ID.
 */
export const SetSceneSchema = v.object({
  name: v.literal("setScene"),
  args: v.object({
    /**
     * The ID of the scene to set.
     */
    sceneId: v.string(),
  }),
});

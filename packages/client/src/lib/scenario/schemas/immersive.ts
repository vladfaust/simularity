import { StateCommandSchema } from "@/lib/simulation/state/commands";
import { v } from "@/lib/valibot";
import { BaseScenarioSchema, IdSchema } from "./base";

const SpriteTransformSchema = v.object({
  /**
   * X-axis offset in pixels.
   */
  x: v.optional(v.number()),

  /**
   * Y-axis offset in pixels.
   */
  y: v.optional(v.number()),

  /**
   * Scale factor.
   */
  scale: v.optional(v.number()),
});

export const ImmersiveScenarioSchema = v.object({
  ...BaseScenarioSchema.entries,

  /**
   * Whether the scenario is immersive.
   * Immersive scenario implies visual and audio content.
   */
  immersive: v.literal(true),

  /**
   * Characters in the scenario.
   * The first character is the default player character.
   */
  characters: v.record(
    IdSchema,
    v.object({
      ...BaseScenarioSchema.entries.characters.value.entries,

      /**
       * List of character outfits (required).
       * The first outfit is the default one.
       */
      outfits:
        BaseScenarioSchema.entries.characters.value.entries.outfits.wrapped,

      /**
       * List of character expressions.
       * The first expression is the default one.
       */
      expressions: v.array(IdSchema),

      /**
       * A layered sprites avatar comprises the following components:
       *
       * - body,
       * - expression,
       * - and outfit.
       */
      layeredSpritesAvatar: v.object({
        /**
         * Expressions preview transformation settings,
         * e.g. for the character selection screen.
         */
        expressionsPreviewTransform: v.optional(SpriteTransformSchema),

        /**
         * Outfits preview transformation settings,
         * e.g. for the character selection screen.
         */
        outfitsPreviewTransform: v.optional(SpriteTransformSchema),

        /**
         * Body sprite files.
         */
        bodies: v.array(v.string()),

        /**
         * Character expression sprites.
         * Must match the upper-level `expressions` list.
         */
        expressions: v.record(
          IdSchema,
          v.object({
            /**
             * Body index to apply the expression to.
             */
            bodyId: v.number(),

            /**
             * Expression sprite file.
             */
            file: v.string(),
          }),
        ),

        /**
         * Character outfit sprites.
         * Must match the upper-level `outfits` list.
         */
        outfits: v.record(
          IdSchema,
          v.object({
            /**
             * Outfit sprite files, with index matching the body's.
             */
            files: v.array(v.string()),
          }),
        ),
      }),
    }),
  ),

  /**
   * A list of scenes in the scenario, included in Director prompts.
   * Scenes are not neccessarily tied to locations.
   * Once a scene is set, it is displayed in the Writer prompt.
   */
  scenes: v.record(
    IdSchema,
    v.object({
      /**
       * Scene name.
       */
      name: v.string(),

      /**
       * Scene prompt.
       */
      prompt: v.string(),

      /**
       * Scene background image URL.
       */
      bg: v.string(),

      /**
       * Scene ambient sound paths in different formats.
       */
      ambienceSoundPaths: v.optional(v.array(v.string())),

      visualization: v.optional(
        v.object({
          sd: v.optional(
            v.object({
              prompt: v.string(),
            }),
          ),
        }),
      ),
    }),
  ),

  /**
   * List of episode definitions.
   * The first episode is the default one.
   */
  episodes: v.record(
    IdSchema,
    v.object({
      ...BaseScenarioSchema.entries.episodes.value.entries,

      /**
       * If the scenario begins from this episode,
       * the initial checkpoint is set here.
       */
      initialCheckpoint: v.object({
        ...BaseScenarioSchema.entries.episodes.value.entries.initialCheckpoint
          .entries,

        /**
         * State of the scenario at the beginning of the episode.
         */
        state: v.object({
          stage: v.object({
            sceneId: IdSchema,
            characters: v.array(
              v.object({
                id: IdSchema,
                expressionId: IdSchema,
                outfitId: IdSchema,
              }),
            ),
          }),
        }),
      }),

      /**
       * Episode chunks.
       */
      chunks: v.array(
        v.object({
          ...BaseScenarioSchema.entries.episodes.value.entries.chunks.item
            .entries,

          /**
           * Director updates for the chunk.
           */
          directorUpdate: v.optional(v.array(StateCommandSchema)),
        }),
      ),
    }),
  ),
});

import * as v from "valibot";
import { StateCommandSchema } from "../commands.js";
import {
  AssetSchema,
  baseScenarioAssets,
  BaseScenarioSchema,
  IdSchema,
} from "./base.js";

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

// NOTE: Don't forget to update `immersiveScenarioAssets` when adding new assets.
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
        bodies: v.array(AssetSchema),

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
             * Expression sprite.
             */
            asset: AssetSchema,
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
             * Outfit sprite assets, with index matching the body's.
             */
            assets: v.array(AssetSchema),
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
       * Scene background image.
       */
      bg: AssetSchema,

      /**
       * Scene ambient sound paths in different formats.
       */
      ambienceSounds: v.optional(v.array(AssetSchema)),

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

/**
 * Iterate over all assets in the immersive scenario.
 */
export function* immersiveScenarioAssets(
  manifest: v.InferOutput<typeof ImmersiveScenarioSchema>,
): Generator<{
  jsonpath: string;
  public?: boolean;
  asset: v.InferOutput<typeof AssetSchema>;
}> {
  for (const entry of baseScenarioAssets(manifest)) {
    yield entry;
  }

  for (const [characterId, character] of Object.entries(manifest.characters)) {
    if (character.layeredSpritesAvatar) {
      for (const [
        index,
        asset,
      ] of character.layeredSpritesAvatar.bodies.entries()) {
        yield {
          jsonpath: `$.characters.${characterId}.layeredSpritesAvatar.bodies[${index}]`,
          asset,
        };
      }

      for (const [expressionId, expression] of Object.entries(
        character.layeredSpritesAvatar.expressions,
      )) {
        yield {
          jsonpath: `$.characters.${characterId}.layeredSpritesAvatar.expressions.${expressionId}.asset`,
          asset: expression.asset,
        };
      }

      for (const [outfitId, outfit] of Object.entries(
        character.layeredSpritesAvatar.outfits,
      )) {
        for (const [index, asset] of outfit.assets.entries()) {
          yield {
            jsonpath: `$.characters.${characterId}.layeredSpritesAvatar.outfits.${outfitId}.assets[${index}]`,
            asset,
          };
        }
      }
    }
  }

  for (const [sceneId, scene] of Object.entries(manifest.scenes)) {
    yield {
      jsonpath: `$.scenes.${sceneId}.bg`,
      asset: scene.bg,
    };

    if (scene.ambienceSounds) {
      for (const [index, asset] of scene.ambienceSounds.entries()) {
        yield {
          jsonpath: `$.scenes.${sceneId}.ambienceSounds[${index}]`,
          asset,
        };
      }
    }
  }
}

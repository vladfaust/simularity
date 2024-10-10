import * as v from "valibot";
import { LocaleSchema, MultiLocaleTextSchema } from "../common.js";

const TtsParamsSchema = v.object({
  speed: v.optional(v.number()),
});

export const IdSchema = v.pipe(v.string(), v.regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/));

export const AssetSchema = v.object({
  /**
   * Asset file path (normalized, relative to manifest).
   */
  path: v.string(),

  /**
   * Asset SHA-256 hash (hex w/o leading `0x`).
   * Unset when uploading new assets.
   */
  hash: v.optional(v.string()),

  /**
   * S3 version ID.
   * Unset when uploading new assets.
   */
  versionId: v.optional(v.string()),

  /**
   * Asset size in bytes.
   * Unset when uploading new assets.
   */
  size: v.optional(v.number()),
});

// TODO: export const MultiLocaleAssetSchema = v.record(LocaleSchema, AssetSchema);

// NOTE: Don't forget to update `baseScenarioAssets` when adding new assets.
export const BaseScenarioSchema = v.object({
  /**
   * Scenario protocol version.
   */
  proto: v.literal("v1"),

  /**
   * Scenario version (for updates).
   */
  version: v.number(),

  /**
   * Scenario name.
   */
  name: MultiLocaleTextSchema,

  /**
   * Whether the scenario is not safe for work.
   */
  nsfw: v.optional(v.boolean()),

  /**
   * A list of tags to categorize the scenario.
   */
  tags: v.optional(v.array(v.string())),

  icon: v.optional(AssetSchema),
  logo: v.optional(AssetSchema),

  /**
   * Scenario thumbnail image.
   * Recommended aspect ratio: 2:3.
   */
  thumbnail: v.optional(AssetSchema),

  /**
   * Scenario cover image.
   * Recommended aspect ratio: 16:9.
   */
  coverImage: v.optional(AssetSchema),

  /**
   * Which languages the scenario is available in.
   */
  locales: v.array(LocaleSchema),

  /**
   * Minimum recommended context window size for the scenario, in tokens.
   */
  contextWindowSize: v.pipe(v.number(), v.integer()),

  /**
   * A very short description of the scenario.
   */
  teaser: MultiLocaleTextSchema,

  /**
   * A short description of the scenario.
   */
  about: MultiLocaleTextSchema,

  /**
   * A longer description of the scenario, Markdown-formatted.
   */
  description: v.optional(MultiLocaleTextSchema),

  /**
   * Global scenario prompt, always present.
   * Describe the setting and the situation.
   */
  globalScenario: v.optional(MultiLocaleTextSchema),

  /**
   * Secret instructions to drive AI generation, in English.
   */
  instructions: v.optional(v.string()),

  /**
   * Voice models and embeddings for the narrator.
   */
  narratorVoices: v.optional(
    v.object({
      /**
       * An XTTSv2 voice model.
       */
      xttsV2: v.optional(
        v.object({
          /**
           * Voice embedding.
           */
          embedding: AssetSchema,

          /**
           * XTTSv2 voice model parameters.
           */
          params: v.optional(TtsParamsSchema),
        }),
      ),
    }),
  ),

  /**
   * Characters in the scenario.
   * The first character is the default player character.
   */
  characters: v.record(
    IdSchema,
    v.object({
      /**
       * Character name to display.
       */
      name: MultiLocaleTextSchema,

      /**
       * Character color to paint the character's name with.
       */
      color: v.optional(v.string()),

      /**
       * Short character description.
       */
      about: MultiLocaleTextSchema,

      /**
       * Character profile picture.
       */
      pfp: v.optional(AssetSchema),

      /**
       * The full name of the character, if any.
       */
      fullName: v.optional(MultiLocaleTextSchema),

      /**
       * A static personal prompt for the character, e.g. psychological traits.
       */
      personalityPrompt: v.string(),

      /**
       * Psychological traits of the character.
       */
      psychologicalTraits: v.optional(
        v.object({
          /**
           * Four-letter code representing the Myers-Briggs
           * Type Indicator (MBTI) personality type.
           * @example "ISTP" // Introverted, Sensing, Thinking, Perceiving.
           */
          fourLetters: v.optional(v.string()),

          /**
           * Enneagram type describing motivations and fears.
           * @example "9w8" // Core type 9 with a type 8 wing.
           */
          enneagram: v.optional(v.string()),

          /**
           * Specifies the instinctual stacking in the Enneagram.
           * @example "sp/so" // Self-preservation and social instincts.
           */
          instinctualVariant: v.optional(v.string()),

          /**
           * Three Enneagram types that combine to provide
           * a more detailed understanding of the personality.
           * @example "964"
           */
          tritype: v.optional(v.string()),

          /**
           * A personality type in Socionics (a theory of information processing
           * and personality), similar to MBTI but with different
           * functions and interactions.
           * @example "ILI" // Introverted, Logical, Intuitive.
           */
          socionics: v.optional(v.string()),

          /**
           * Alignment in fantasy role-playing games that describes a character
           * who acts without bias towards good or evil, law or chaos.
           * @example "True Neutral"
           */
          alignment: v.optional(v.string()),

          /**
           * A representation of the Big Five personality traits.
           * @example "RCUEI" // Reserved, Calm, Unstructured, Eccentric, Introverted.
           */
          bigFive: v.optional(v.string()),

          /**
           * A four-letter code from Attitudinal Psyche theory.
           * @example "FLEV" // Focus, Logic, Expressiveness, Vision.
           */
          attitudinalPsyche: v.optional(v.string()),

          /**
           * A classical temperament.
           * @example "Melancholic [Dominant]"
           */
          temperaments: v.optional(v.string()),

          /**
           * Based on Jungian psychology.
           *
           * @example
           * "IT(S)" // Focusing on  introverted thinking and sensing.
           */
          classicJungian: v.optional(v.string()),
        }),
      ),

      /**
       * A list of trops to describe the character.
       */
      characterTropes: v.optional(v.record(v.string(), v.string())),

      /**
       * Appearance traits prompt for the character, e.g. hair color.
       */
      appearancePrompt: v.optional(v.string()),

      /**
       * Scenario-specific prompt for the character, e.g. occupation.
       */
      scenarioPrompt: v.optional(MultiLocaleTextSchema),

      /**
       * Relationships with other characters in the scenario.
       */
      relationships: v.optional(v.record(IdSchema, v.string())),

      /**
       * Optional list of character outfits.
       */
      outfits: v.optional(
        v.record(
          IdSchema,
          v.object({
            name: MultiLocaleTextSchema,
            prompt: v.string(),
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
      ),

      visualization: v.optional(
        v.object({
          sd: v.optional(
            v.object({
              lora: v.optional(
                v.object({
                  id: v.string(),
                  baseWeight: v.optional(v.number(), 1),
                }),
              ),
              prompt: v.string(),
            }),
          ),
        }),
      ),

      /**
       * Voice models and embeddings for the character.
       */
      voices: v.optional(
        v.object({
          /**
           * An XTTSv2 voice model.
           */
          xttsV2: v.optional(
            v.object({
              /**
               * Voice embedding.
               */
              embedding: AssetSchema,

              /**
               * XTTSv2 voice model parameters.
               */
              params: v.optional(TtsParamsSchema),
            }),
          ),
        }),
      ),
    }),
  ),

  /**
   * A list of locations in the scenario, included in Writer prompts.
   * May include different levels, e.g. school and classroom.
   */
  locations: v.array(
    v.object({
      /**
       * Location name.
       */
      name: MultiLocaleTextSchema,

      /**
       * Location description.
       */
      prompt: v.string(),
    }),
  ),

  /**
   * List of episode definitions.
   * The first episode is the default one.
   */
  episodes: v.record(
    IdSchema,
    v.object({
      /**
       * Episode name.
       */
      name: MultiLocaleTextSchema,

      /**
       * Short episode description.
       */
      about: MultiLocaleTextSchema,

      /**
       * Episode image.
       * Recommended aspect ratio: 16:9.
       */
      image: v.optional(AssetSchema),

      /**
       * If the scenario begins from this episode,
       * the initial checkpoint is set here.
       */
      initialCheckpoint: v.object({
        summary: v.nullable(v.string()),
      }),

      chunks: v.array(
        v.object({
          writerUpdate: v.object({
            /**
             * Null for the narrator.
             */
            characterId: v.nullable(IdSchema),

            /**
             * Simulation day clock for this chunk,
             * in 24h format, e.g. "16:20" or "04:20".
             */
            clock: v.pipe(
              v.string(),
              v.regex(/^\d{2}:\d{2}$/),
              v.check((input) => {
                const hours = parseInt(input.slice(0, 2));
                return hours >= 0 && hours <= 24;
              }, "Hours must be between 0 and 24"),
              v.check((input) => {
                const minutes = parseInt(input.slice(3, 5));
                return minutes >= 0 && minutes <= 60;
              }, "Minutes must be between 0 and 60"),
            ),

            text: MultiLocaleTextSchema,
          }),

          /**
           * An optional list of characters to enable, exclusively.
           */
          enabledCharacters: v.optional(v.array(IdSchema)),
        }),
      ),
    }),
  ),

  /**
   * List of achievements in the scenario.
   */
  achievements: v.optional(
    v.record(
      IdSchema,
      v.object({
        title: MultiLocaleTextSchema,
        description: MultiLocaleTextSchema,
        icon: v.optional(AssetSchema),
        points: v.number(),
      }),
    ),
  ),
});

/**
 * Iterate over all assets in a base scenario manifest.
 */
export function* baseScenarioAssets(
  manifest: v.InferOutput<typeof BaseScenarioSchema>,
): Generator<{
  jsonpath: string;
  public?: boolean;
  asset: v.InferOutput<typeof AssetSchema>;
}> {
  if (manifest.icon)
    yield { jsonpath: "$.icon", public: true, asset: manifest.icon };

  if (manifest.logo)
    yield { jsonpath: "$.logo", public: true, asset: manifest.logo };

  if (manifest.thumbnail)
    yield { jsonpath: "$.thumbnail", public: true, asset: manifest.thumbnail };

  if (manifest.coverImage)
    yield {
      jsonpath: "$.coverImage",
      public: true,
      asset: manifest.coverImage,
    };

  if (manifest.narratorVoices?.xttsV2?.embedding)
    yield {
      jsonpath: "$.narratorVoices.xttsV2.embedding",
      asset: manifest.narratorVoices?.xttsV2?.embedding,
    };

  for (const [characterId, character] of Object.entries(manifest.characters)) {
    if (character.pfp)
      yield {
        jsonpath: `$.characters.${characterId}.pfp`,
        public: true,
        asset: character.pfp,
      };

    if (character.voices?.xttsV2?.embedding)
      yield {
        jsonpath: `$.characters.${characterId}.voices.xttsV2.embedding`,
        asset: character.voices?.xttsV2?.embedding,
      };
  }

  for (const [episodeId, episode] of Object.entries(manifest.episodes)) {
    if (episode.image)
      yield {
        jsonpath: `$.episodes.${episodeId}.image`,
        public: true,
        asset: episode.image,
      };
  }

  if (manifest.achievements) {
    for (const [achievementId, achievement] of Object.entries(
      manifest.achievements,
    )) {
      if (achievement.icon)
        yield {
          jsonpath: `$.achievements.${achievementId}.icon`,
          public: true,
          asset: achievement.icon,
        };
    }
  }
}

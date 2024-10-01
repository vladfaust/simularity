import { v } from "@/lib/valibot";
import { TtsParamsSchema } from "../../ai/tts/BaseTtsDriver";

export const IdSchema = v.pipe(
  v.string(),
  v.regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/),
);

export const BaseScenarioSchema = v.object({
  /**
   * Scenario protocol version.
   */
  proto: v.string(),

  /**
   * Scenario name.
   */
  name: v.string(),

  /**
   * Whether the scenario is not safe for work.
   */
  nsfw: v.optional(v.boolean()),

  /**
   * A list of tags to categorize the scenario.
   */
  tags: v.optional(v.array(v.string())),

  iconPath: v.optional(v.string()),
  logoPath: v.optional(v.string()),

  /**
   * Scenario thumbnail image path.
   * Recommended aspect ratio: 2:3.
   */
  thumbnailPath: v.optional(v.string()),

  /**
   * Scenario cover image path.
   * Recommended aspect ratio: 16:9.
   */
  coverImagePath: v.optional(v.string()),

  /**
   * Scenario media files for preview.
   */
  media: v.optional(
    v.array(
      v.object({
        type: v.literal("image"),
        path: v.string(),
      }),
    ),
  ),

  /**
   * What language the scenario is defined in.
   * This is useful for language-specific models.
   */
  language: v.string(),

  /**
   * Minimum recommended context window size for the scenario, in tokens.
   */
  contextWindowSize: v.pipe(v.number(), v.integer()),

  /**
   * A very short description of the scenario.
   */
  teaser: v.string(),

  /**
   * A short description of the scenario.
   */
  about: v.string(),

  /**
   * A longer description of the scenario, Markdown-formatted.
   */
  description: v.optional(v.string()),

  /**
   * Tell the model what the player is expecting from this scenario.
   */
  excerpt: v.optional(v.string()),

  /**
   * Global scenario prompt, always present.
   * Describe the setting and the situation.
   */
  globalScenario: v.optional(v.string()),

  /**
   * "Secret" instructions to drive AI generation.
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
           * Voice embedding path.
           */
          embeddingPath: v.string(),

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
      name: v.string(),

      /**
       * Character color to paint the character's name with.
       */
      color: v.optional(v.string()),

      /**
       * Short character description.
       */
      about: v.string(),

      /**
       * Character profile picture path.
       */
      pfpPath: v.optional(v.string()),

      /**
       * The full name of the character, if any.
       */
      fullName: v.optional(v.string()),

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
      scenarioPrompt: v.optional(v.string()),

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
            name: v.string(),
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
               * Voice embedding path.
               */
              embeddingPath: v.string(),

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
      name: v.string(),

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
      name: v.string(),

      /**
       * Short episode description.
       */
      about: v.string(),

      /**
       * Episode image path.
       * Recommended aspect ratio: 16:9.
       */
      imagePath: v.optional(v.string()),

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
              v.transform((input) => ({
                hours: parseInt(input.slice(0, 2)),
                minutes: parseInt(input.slice(3, 5)),
              })),
            ),

            text: v.pipe(v.string(), v.trim(), v.nonEmpty()),
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
    v.array(
      v.object({
        title: v.string(),
        description: v.string(),
        iconPath: v.optional(v.string()),
        points: v.number(),
      }),
    ),
  ),
});

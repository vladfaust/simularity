import {
  BaseDirectory,
  createDir,
  exists,
  readDir,
  readTextFile,
} from "@tauri-apps/api/fs";
import { join, resolve, resolveResource } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import { TtsParamsSchema } from "../ai/tts/BaseTtsDriver";
import { resolveBaseDir, RESOURCES_PATH } from "../tauri";
import { safeParseJson } from "../utils";
import { formatIssues, v } from "../valibot";
import { StateCommandSchema } from "./state/commands";

const MANIFEST_FILE_NAME = "manifest.json";

export class ScenarioError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = `ScenarioError at ${path}`;
  }
}

export const IdSchema = v.pipe(
  v.string(),
  v.regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/),
);

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

const ImmersiveScenarioSchema = v.object({
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

export class BaseScenario {
  constructor(
    readonly builtin: boolean,
    readonly id: string,
    readonly basePath: string,
    readonly content: v.InferOutput<typeof BaseScenarioSchema>,
  ) {}

  async resourceUrl(path: string) {
    return join(this.basePath, path).then(convertFileSrc);
  }

  async getThumbnailUrl() {
    if (!this.content.thumbnailPath) return undefined;
    return this.resourceUrl(this.content.thumbnailPath);
  }

  async getCoverImageUrl() {
    if (!this.content.coverImagePath) return undefined;
    return this.resourceUrl(this.content.coverImagePath);
  }

  async getMediaUrls() {
    return this.content.media
      ? Promise.all(
          this.content.media?.map((media) => this.resourceUrl(media.path)),
        )
      : [];
  }

  get defaultCharacterId() {
    return Object.keys(this.content.characters)[0];
  }

  get defaultCharacter() {
    return this.content.characters[this.defaultCharacterId];
  }

  async getCharacterPfpUrl(characterId: string) {
    const character = this.ensureCharacter(characterId);
    if (!character.pfpPath) return undefined;
    return this.resourceUrl(character.pfpPath);
  }

  findCharacter(characterId: string) {
    const scene = this.content.characters[characterId];
    if (!scene) return undefined;
    return scene;
  }

  ensureCharacter(characterId: string) {
    const found = this.findCharacter(characterId);
    if (!found) throw new Error(`Character not found: ${characterId}`);
    return found;
  }

  findEpisode(episodeId: string) {
    const episode = this.content.episodes[episodeId];
    if (!episode) return undefined;
    return episode;
  }

  ensureEpisode(episodeId: string) {
    const found = this.findEpisode(episodeId);
    if (!found) throw new Error(`Episode not found: ${episodeId}`);
    return found;
  }

  get defaultEpisodeId() {
    return Object.keys(this.content.episodes)[0];
  }

  get defaultEpisode() {
    return this.content.episodes[this.defaultEpisodeId];
  }
}

export class ImmersiveScenario {
  constructor(
    readonly builtin: boolean,
    readonly id: string,
    readonly basePath: string,
    readonly content: v.InferOutput<typeof ImmersiveScenarioSchema>,
  ) {}

  async resourceUrl(path: string) {
    return join(this.basePath, path).then(convertFileSrc);
  }

  async getThumbnailUrl() {
    if (!this.content.thumbnailPath) return undefined;
    return this.resourceUrl(this.content.thumbnailPath);
  }

  async getCoverImageUrl() {
    if (!this.content.coverImagePath) return undefined;
    return this.resourceUrl(this.content.coverImagePath);
  }

  async getMediaUrls() {
    return this.content.media
      ? Promise.all(
          this.content.media?.map((media) => this.resourceUrl(media.path)),
        )
      : [];
  }

  get defaultCharacterId() {
    return Object.keys(this.content.characters)[0];
  }

  get defaultCharacter() {
    return this.content.characters[this.defaultCharacterId];
  }

  async getCharacterPfpUrl(characterId: string) {
    const character = this.ensureCharacter(characterId);
    if (!character.pfpPath) return undefined;
    return this.resourceUrl(character.pfpPath);
  }

  findCharacter(characterId: string) {
    const scene = this.content.characters[characterId];
    if (!scene) return undefined;
    return scene;
  }

  ensureCharacter(characterId: string) {
    const found = this.findCharacter(characterId);
    if (!found) throw new Error(`Character not found: ${characterId}`);
    return found;
  }

  defaultOutfitId(characterId: string) {
    const character = this.ensureCharacter(characterId);
    return Object.keys(character.outfits)[0];
  }

  findOutfit(characterId: string, outfitId: string) {
    const character = this.ensureCharacter(characterId);
    const outfit = character.outfits[outfitId];
    if (!outfit) return undefined;
    return outfit;
  }

  ensureOutfit(characterId: string, outfitId: string) {
    const found = this.findOutfit(characterId, outfitId);
    if (!found) throw new Error(`Outfit not found: ${outfitId}`);
    return found;
  }

  defaultExpressionId(characterId: string) {
    const character = this.ensureCharacter(characterId);
    return character.expressions[0];
  }

  findExpression(characterId: string, expressionId: string) {
    const character = this.ensureCharacter(characterId);
    if (!character.expressions.includes(expressionId)) return undefined;
    return expressionId;
  }

  ensureExpression(characterId: string, expressionId: string) {
    const found = this.findExpression(characterId, expressionId);
    if (!found) throw new Error(`Expression not found: ${expressionId}`);
    return found;
  }

  get defaultSceneId() {
    return Object.keys(this.content.scenes)[0];
  }

  get defaultScene() {
    return this.content.scenes[this.defaultSceneId];
  }

  findScene(sceneId: string) {
    const scene = this.content.scenes[sceneId];
    if (!scene) return undefined;
    return scene;
  }

  ensureScene(sceneId: string) {
    const found = this.findScene(sceneId);
    if (!found) throw new Error(`Scene not found: ${sceneId}`);
    return found;
  }

  findEpisode(episodeId: string) {
    const episode = this.content.episodes[episodeId];
    if (!episode) return undefined;
    return episode;
  }

  ensureEpisode(episodeId: string) {
    const found = this.findEpisode(episodeId);
    if (!found) throw new Error(`Episode not found: ${episodeId}`);
    return found;
  }

  get defaultEpisodeId() {
    return Object.keys(this.content.episodes)[0];
  }

  get defaultEpisode() {
    return this.content.episodes[this.defaultEpisodeId];
  }
}

export type Scenario = BaseScenario | ImmersiveScenario;

export async function readScenarios(
  baseDir: BaseDirectory,
): Promise<Scenario[]> {
  let scenariosDir;

  switch (baseDir) {
    case BaseDirectory.AppLocalData:
      if (!(await exists("scenarios", { dir: baseDir }))) {
        await createDir("scenarios", { dir: baseDir });
      }

      scenariosDir = await resolve(await resolveBaseDir(baseDir), "scenarios");
      break;

    case BaseDirectory.Resource:
      scenariosDir = await resolveResource(`${RESOURCES_PATH}/scenarios`);
      break;

    default:
      throw new Error(`Unimplemented for base directory: ${baseDir}`);
  }

  const scenarios: Scenario[] = [];
  // console.debug(`Reading scenarios from ${scenariosDir}`);
  const entries = await readDir(scenariosDir);

  for (const entry of entries) {
    if (!entry.name || !entry.children) continue;

    try {
      const scenario = await readScenario(baseDir, entry.name);
      scenarios.push(scenario);
    } catch (e: any) {
      if (e instanceof ScenarioError) {
        console.error(e);
      } else {
        throw e;
      }
    }
  }

  return scenarios;
}

export async function readAllScenarios(): Promise<Scenario[]> {
  const scenarios = await readScenarios(BaseDirectory.Resource);
  const localScenarios = await readScenarios(BaseDirectory.AppLocalData);

  return [...scenarios, ...localScenarios];
}

export async function readScenario(
  baseDir: BaseDirectory,
  id: string,
): Promise<Scenario> {
  let path, manifestPath;

  switch (baseDir) {
    case BaseDirectory.AppLocalData:
      path = await resolve(await resolveBaseDir(baseDir), "scenarios", id);
      manifestPath = await join(path, MANIFEST_FILE_NAME);

      break;
    case BaseDirectory.Resource:
      path = await resolveResource(`${RESOURCES_PATH}/scenarios/${id}`);
      manifestPath = await resolveResource(
        `${RESOURCES_PATH}/scenarios/${id}/${MANIFEST_FILE_NAME}`,
      );

      break;

    default:
      throw new Error(`Unimplemented for base directory: ${baseDir}`);
  }

  let manifestString;
  try {
    console.debug(`Reading scenario from ${manifestPath}`);
    manifestString = await readTextFile(manifestPath);
  } catch (error: any) {
    throw new ScenarioError(manifestPath, error.message);
  }

  const manifestJsonParseResult = safeParseJson<any>(manifestString);
  if (!manifestJsonParseResult.success) {
    throw new ScenarioError(manifestPath, manifestJsonParseResult.error);
  }

  const scenarioParseResult = v.safeParse(
    "immersive" in manifestJsonParseResult.output &&
      manifestJsonParseResult.output.immersive
      ? ImmersiveScenarioSchema
      : BaseScenarioSchema,
    manifestJsonParseResult.output,
  );
  if (!scenarioParseResult.success) {
    throw new ScenarioError(
      manifestPath,
      formatIssues(scenarioParseResult.issues),
    );
  }

  if ("immersive" in scenarioParseResult.output) {
    console.debug(`Read immersive scenario: ${id}`);
    return new ImmersiveScenario(
      baseDir === BaseDirectory.Resource,
      id,
      path,
      scenarioParseResult.output,
    );
  } else {
    console.debug(`Read base scenario: ${id}`);
    return new BaseScenario(
      baseDir === BaseDirectory.Resource,
      id,
      path,
      scenarioParseResult.output,
    );
  }
}

/**
 * Find a scenario by ID, first looking in the resource directory,
 * then in the local data directory.
 *
 * @throws If the scenario is not found in either directory.
 */
export async function ensureScenario(id: string): Promise<Scenario> {
  // First, try to read the scenario from the resource directory.
  const scenario = await readScenario(BaseDirectory.Resource, id).catch(
    (e: any) => {
      if (e instanceof ScenarioError) return null;
      else throw e;
    },
  );

  if (scenario) {
    return scenario;
  }

  // If the scenario is not found in the resource directory, try the local data directory.
  return await readScenario(BaseDirectory.AppLocalData, id);
}

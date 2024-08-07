import {
  BaseDirectory,
  createDir,
  exists,
  readDir,
  readTextFile,
} from "@tauri-apps/api/fs";
import { join, resolve } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import { resolveBaseDir } from "../tauri";
import { safeParseJson } from "../utils";
import { formatIssues, v } from "../valibot";
import { StateCommandSchema } from "./state/commands";

const IdSchema = v.pipe(v.string(), v.regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/));

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

// TODO: Semantic validation (proper IDs, etc.).
const ScenarioSchema = v.object({
  /**
   * Scenario protocol version.
   */
  proto: v.string(),

  /**
   * Scenario name.
   */
  name: v.string(),

  /**
   * Scenario thumbnail image path.
   * Recommended aspect ratio: 1:1.
   */
  thumbnailPath: v.optional(v.string()),

  /**
   * Scenario cover image path.
   * Recommended aspect ratio: 16:9.
   */
  coverImagePath: v.optional(v.string()),

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
   * A short description of the scenario.
   */
  about: v.string(),

  /**
   * A longer description of the scenario.
   */
  description: v.string(),

  /**
   * Tell the model what the player is expecting from this scenario.
   */
  excerpt: v.string(),

  /**
   * Global scenario prompt, always present.
   * Describe the setting and the situation.
   */
  globalScenario: v.string(),

  /**
   * "Secret" instructions to drive AI generation.
   */
  instructions: v.string(),

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
       * Whether the character is disabled.
       */
      disabled: v.optional(v.boolean()),

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
       * A list of traits to describe the character.
       */
      // TODO: Remove in favor of personalityPrompt.
      characterTraits: v.array(v.string()),

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
       * List of character expressions.
       * The first expression is the default one.
       */
      expressions: v.array(IdSchema),

      /**
       * List of character outfits.
       * The first outfit is the default one.
       */
      outfits: v.record(
        IdSchema,
        v.object({
          name: v.string(),
          prompt: v.string(),
        }),
      ),

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

      chunks: v.array(
        v.object({
          writerUpdate: v.object({
            /**
             * Null for the narrator.
             */
            characterId: v.nullable(IdSchema),

            text: v.string(),
          }),
          directorUpdate: v.optional(v.array(StateCommandSchema)),
        }),
      ),
    }),
  ),
});

export class Scenario {
  constructor(
    readonly id: string,
    readonly basePath: string,
    private readonly content: v.InferOutput<typeof ScenarioSchema>,
  ) {}

  async resourceUrl(path: string) {
    return join(this.basePath, path).then(convertFileSrc);
  }

  get name() {
    return this.content.name;
  }

  async getThumbnailUrl() {
    if (!this.content.thumbnailPath) return undefined;
    return this.resourceUrl(this.content.thumbnailPath);
  }

  async getCoverImageUrl() {
    if (!this.content.coverImagePath) return undefined;
    return this.resourceUrl(this.content.coverImagePath);
  }

  get language() {
    return this.content.language;
  }

  get contextWindowSize() {
    return this.content.contextWindowSize;
  }

  get about() {
    return this.content.about;
  }

  get description() {
    return this.content.description;
  }

  get excerpt() {
    return this.content.excerpt;
  }

  get globalScenario() {
    return this.content.globalScenario;
  }

  get instructions() {
    return this.content.instructions;
  }

  get characters() {
    return this.content.characters;
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

  get locations() {
    return this.content.locations;
  }

  get scenes() {
    return this.content.scenes;
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

  get episodes() {
    return this.content.episodes;
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

class ParseError extends Error {
  constructor(readonly message: string) {
    super(message);
    this.name = "ParseError";
  }
}

export type ErroredScenario = {
  id: string;
  basePath: string;
  error: Error;
};

export async function readScenarios(
  scenariosDir = "scenarios",
  baseDir: BaseDirectory = BaseDirectory.AppLocalData,
): Promise<(Scenario | ErroredScenario)[]> {
  if (!(await exists(scenariosDir, { dir: baseDir }))) {
    console.log(`Creating scenarios directory at ${scenariosDir}`);
    await createDir(scenariosDir, { dir: baseDir });
  }

  const scenarios: (Scenario | ErroredScenario)[] = [];

  const entries = await readDir(scenariosDir, { dir: baseDir });
  for (const entry of entries) {
    if (!entry.name || !entry.children) continue;
    scenarios.push(await readScenario(entry.name, scenariosDir, baseDir));
  }

  return scenarios;
}

export async function readScenario(
  id: string,
  scenariosDir: string = "scenarios",
  baseDir: BaseDirectory = BaseDirectory.AppLocalData,
): Promise<Scenario | ErroredScenario> {
  const basePath = await resolve(
    await resolveBaseDir(baseDir),
    scenariosDir,
    id,
  );

  const indexPath = await join(scenariosDir, id, `index.json`);

  let indexString;
  try {
    indexString = await readTextFile(indexPath, { dir: baseDir });
  } catch (error) {
    return {
      id,
      basePath,
      error: new Error(`Failed to read ${indexPath}`),
    };
  }

  const indexJsonParseResult =
    safeParseJson<v.InferInput<typeof ScenarioSchema>>(indexString);
  if (!indexJsonParseResult.success) {
    return {
      id,
      basePath,
      error: new ParseError(indexJsonParseResult.error),
    };
  }

  const scenarioParseResult = v.safeParse(
    ScenarioSchema,
    indexJsonParseResult.output,
  );
  if (!scenarioParseResult.success) {
    const error = new ParseError(formatIssues(scenarioParseResult.issues));
    return { id, basePath, error };
  }

  return new Scenario(id, basePath, scenarioParseResult.output);
}

export async function ensureReadScenario(
  id: string,
  scenariosDir: string = "scenarios",
  baseDir: BaseDirectory = BaseDirectory.AppLocalData,
): Promise<Scenario> {
  const scenario = await readScenario(id, scenariosDir, baseDir);
  if (scenario instanceof Scenario) return scenario;

  throw scenario.error;
}

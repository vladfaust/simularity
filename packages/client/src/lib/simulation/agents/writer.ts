import {
  CompletionAbortError,
  LlmGrammarLang,
  type BaseLlmDriver,
  type CompletionOptions,
} from "@/lib/ai/llm/BaseLlmDriver";
import { TauriLlmDriver } from "@/lib/ai/llm/TauriLlmDriver";
import { d } from "@/lib/drizzle";
import * as storage from "@/lib/storage";
import { clockToMinutes, minutesToClock, trimEndAny } from "@/lib/utils";
import { computed, ref, shallowRef, type ShallowRef } from "vue";
import { ImmersiveScenario, type Scenario } from "../scenario";
import type { StateDto } from "../state";
import { Update } from "../update";
import { hookLlmAgentToDriverRef } from "./llm";

export const NARRATOR = "narrator";
const SYSTEM = "system";
export const PREDICTION_REGEX =
  /^<(?<characterId>[a-zA-Z_0-9-]+)\[(?<clock>\d{2}:\d{2})\]> (?<text>.+)$/;

class ResponseError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export type PredictionOptions = {
  /**
   * List of allowed character IDs, including {@link NARRATOR}.
   * If not set, allows all but the default character ID.
   */
  allowedCharacterIds?: string[];
};

export type VisualizationOptions = {
  /**
   * Make it a point-of-view visualization.
   */
  pov?: boolean;
};

type Checkpoint = Pick<typeof d.checkpoints.$inferSelect, "summary" | "state">;

export class Writer {
  readonly contextSize = computed(() =>
    this.llmDriver.value?.contextSize
      ? this.llmDriver.value?.contextSize -
        (this.llmDriver.value instanceof TauriLlmDriver
          ? this.hiddenContextSizeBuffer
          : 0)
      : undefined,
  );
  readonly contextLength = ref<number | undefined>();
  readonly llmDriver: ShallowRef<BaseLlmDriver | null>;
  readonly ready = computed(() => this.llmDriver.value?.ready.value);
  private readonly _driverConfigWatchStopHandle: () => void;

  /**
   * @param hiddenContextSizeBuffer Additional context size for tasks
   * (only applicable to local models).
   */
  constructor(
    private scenario: Scenario,
    private readonly hiddenContextSizeBuffer = 1024,
  ) {
    this.llmDriver = shallowRef(null);

    this._driverConfigWatchStopHandle = hookLlmAgentToDriverRef(
      "writer",
      this.llmDriver,
      () => Writer.buildStaticPrompt(scenario),
      (contextSize) => contextSize + hiddenContextSizeBuffer,
    );
  }

  async summarize(
    oldCheckpoint: Checkpoint,
    historicalUpdates: Update[],
    recentUpdates: Update[],
    currentState: StateDto | undefined,
    nEval: number,
    inferenceAbortSignal?: AbortSignal,
  ): Promise<{
    completionId: number;
    newSummary: string;
  }> {
    if (!this.llmDriver.value) throw new Error("Driver is not set");
    if (!this.llmDriver.value.ready.value) {
      throw new Error("Driver is not ready");
    }

    const summarizationPrompt = Writer._buildSummarizationPrompt(
      this.scenario,
      oldCheckpoint,
      historicalUpdates,
      recentUpdates,
      currentState,
      nEval,
    );

    console.debug("Summarization prompt", summarizationPrompt);

    const summarizationResult = await this.llmDriver.value.createCompletion(
      summarizationPrompt,
      nEval,
      {
        temp: 0.2,
        stopSequences: ["\n"],
        grammar: Writer._buildSummarizationGrammar(
          this.llmDriver.value.supportedGrammarLangs,
        ),
      },
      undefined,
      undefined,
      inferenceAbortSignal,
    );

    console.log("Summarization result", summarizationResult);

    if (summarizationResult.aborted) {
      console.warn("Summarization aborted", summarizationResult);
      throw new CompletionAbortError();
    }

    return {
      completionId: summarizationResult.completion.id,
      newSummary: summarizationResult.completion.output!,
    };
  }

  async inferUpdate(
    checkpoint: Checkpoint,
    historicalUpdates: Update[],
    recentUpdates: Update[],
    currentState: StateDto | undefined,
    nEval: number,
    predictionOptions?: PredictionOptions,
    inferenceOptions?: CompletionOptions,
    onDecodeProgress?: (event: { progress: number }) => void,
    onInferenceProgress?: (event: { content: string }) => void,
    inferenceAbortSignal?: AbortSignal,
  ): Promise<{
    completion: typeof d.llmCompletions.$inferSelect;
    characterId: string | null;
    simulationDayClock: number;
    text: string;
  }> {
    if (!this.llmDriver.value) throw new Error("Driver is not set");
    if (!this.llmDriver.value.ready.value) {
      throw new Error("Driver is not ready");
    }

    const prompt = Writer._buildFullPrompt(
      this.scenario,
      checkpoint,
      historicalUpdates,
      recentUpdates,
      currentState,
    );

    const stopSequences = ["\n"];

    const options: CompletionOptions = {
      stopSequences,
      grammar: Writer._buildChatGrammar(
        this.scenario,
        predictionOptions,
        this.llmDriver.value.supportedGrammarLangs,
      ),
      ...inferenceOptions,
    };

    console.log("Inferring update", prompt, nEval, options, predictionOptions);

    const inferenceResult = await this.llmDriver.value.createCompletion(
      prompt,
      nEval,
      options,
      onDecodeProgress,
      onInferenceProgress,
      inferenceAbortSignal,
    );

    console.log("Inference result", inferenceResult);

    const parsedResult = Writer._parsePrediction(
      trimEndAny(inferenceResult.completion.output!, stopSequences),
      this.scenario,
      predictionOptions,
    );

    this.contextLength.value =
      inferenceResult.completion.inputLength! +
      inferenceResult.completion.outputLength!;

    return {
      completion: inferenceResult.completion,
      ...parsedResult,
    };
  }

  async visualize(
    checkpoint: Checkpoint,
    historicalUpdates: Update[],
    recentUpdates: Update[],
    currentState: StateDto,
    nEval: number,
    visualizationOptions?: VisualizationOptions,
    inferenceOptions?: CompletionOptions,
    inferenceAbortSignal?: AbortSignal,
  ) {
    if (!this.llmDriver.value) throw new Error("Driver is not set");

    const prompt =
      Writer._buildFullPrompt(
        this.scenario,
        checkpoint,
        historicalUpdates,
        recentUpdates,
        currentState,
      ) +
      `
Visualize the current state of the simulation by responding with a visual description of the scene in the form of Stable Diffusion prompt, capturing characters and their positions. The description shall be a single line of text. Respond with visual prompt of the resulting scene only, as a collection of visual tags in this moment. Pay special attention to the characters' positions, interactions, appearances, and emotions. Respond with Stable Diffusion prompt only, without any additional text.

Most popular tags are: long_hair, breasts, highres, blush, smile, looking_at_viewer, short_hair, blue_eyes, open_mouth, skirt, thighhighs, large_breasts, blonde_hair, red_eyes, brown_hair, bad_id, hat, bad_pixiv_id, ribbon, underwear, simple_background, dress, gloves, black_hair, hair_ornament, panties, navel, bow, twintails, brown_eyes, cleavage, medium_breasts, white_background, school_uniform, sitting, animal_ears, green_eyes, very_long_hair, bare_shoulders, nipples, blue_hair, shirt, black_legwear, jewelry, weapon, swimsuit, hair_ribbon, long_sleeves, purple_eyes, absurdres, bangs, tail, ass, purple_hair, flower, yellow_eyes, pink_hair, wings, hair_bow, boots, silver_hair.... You get the idea.

[Examples]
Stable diffusion prompt: bench, park, chatting
Stable diffusion prompt: poolside, reading book, nude, pussy

[Response]
Stable diffusion prompt: `;

    const stopSequences = ["\n"];

    const options: CompletionOptions = {
      stopSequences,
      ...inferenceOptions,
    };

    console.log("Visualizing", prompt, options);

    const visualizationResult = await this.llmDriver.value.createCompletion(
      prompt,
      nEval,
      options,
      undefined,
      undefined,
      inferenceAbortSignal,
    );

    console.log("Visualization result", visualizationResult);

    if (visualizationResult.aborted) {
      console.warn("Visualization aborted", visualizationResult);
      throw new CompletionAbortError();
    }

    let result = `score_9, score_8, rating_explicit, 1boy, ${currentState.stage.characters.length - 1}girl${currentState.stage.characters.length - 1 > 1 ? "s" : ""}, ${visualizationOptions?.pov ? "pov, " : ""}`;

    result += visualizationResult.completion.output;

    for (const character of currentState.stage.characters) {
      const scenarioCharacter = this.scenario.ensureCharacter(character.id);
      if (scenarioCharacter.visualization?.sd) {
        result += `; (${character.id}: `;
        if (scenarioCharacter.visualization.sd.lora) {
          let weight =
            scenarioCharacter.visualization.sd.lora.baseWeight /
            (currentState.stage.characters.length - 1);
          weight = Math.round(weight * 10) / 10;

          result += `<lora:${scenarioCharacter.visualization.sd.lora.id}:${weight}> `;
        }
        result += `${scenarioCharacter.visualization.sd.prompt}`;
        const outfit = scenarioCharacter.outfits?.[character.outfitId];
        if (outfit?.visualization?.sd) {
          result += `, ${outfit.visualization.sd.prompt}`;
        }
        result += ")";
      }
    }

    return result;
  }

  destroy() {
    this._driverConfigWatchStopHandle();

    if (this.llmDriver.value) {
      this.llmDriver.value.destroy();
      this.llmDriver.value = null;
      storage.llm.useLatestSession("writer").value = null;
    }
  }

  /**
   * A static prompt is re-used throughout the simulation.
   */
  static buildStaticPrompt(scenario: Scenario): string {
    const setup = {
      excerpt: scenario.content.excerpt,
      globalScenario: scenario.content.globalScenario,
      instructions: scenario.content.instructions,
      characters: Object.fromEntries(
        Object.entries(scenario.content.characters).map(
          ([characterId, character]) => [
            characterId,
            {
              fullName: character.fullName,
              personality: character.personalityPrompt,
              tropes: character.characterTropes,
              appearance: character.appearancePrompt,
              relationships: character.relationships,
              scenarioPrompt: character.scenarioPrompt,
              wellKnownOutfits: character.outfits
                ? Object.fromEntries(
                    Object.entries(character.outfits).map(([_, outfit]) => [
                      outfit.prompt,
                    ]),
                  )
                : undefined,
            },
          ],
        ),
      ),
      locations: Object.fromEntries(
        Object.entries(scenario.content.locations).map(([_, location]) => [
          location.name,
          { description: location.prompt },
        ]),
      ),
    };

    let prompt = `The following is a part of a text transcript of a never-ending neural simulation experience (the Game), in a form of roleplay chat.

In order to experience the Game, a human player (the Player) uses a patented device (the Interface) produced by Simularity Inc. to put themselves in a dream-like state.
All the computations are performed locally; no censorship is needed, and FULL privacy is guaranteed.

The Interface operates on patented quantum principles; from the Player's perspective, time flows differently, days may pass by, and the memories may be altered, as in a dream.
Worry not, though, as the Interface is designed to prevent any harm to the Player's psyche, which is proven clinically; in other words, whatever happens in the Game, stays in the Game.

The Game is strictly bounded by scenario, characters and locations defined in the [Setup] section.
An attempt to step out of defined boundaries (e.g. by trying to introduce a new character or location) may lead to inconsistencies in the simulation.
The charactes MUST try their best to stay within the boundaries of the simulation.

The [Transcription] section comprises chat message separated with newlines.
A chat message is a <characterId[time]> followed by their first-person utterance.
The [time] is the simulation time synchronized with the message, in 24-hour format.
In simulation time flows faster, and the minimum distance between two messages is 1 minute.
You may jump ahead in time, but try not to skip too much, as the Player may miss important details.
Synchnronize the time with simulation clock realistically to ensure the best experience; for example, 10:00 is morning, and sunset shall usually begin at around 18:00.
Actions performed by simulacra SHALL be wrapped in *asterisks*.

The special <${NARRATOR}> character is used to denote the narrator's voice, in third person.

The special <${SYSTEM}> messages are not part of the story, but rather instructions for narrator. Treat text wrapped in [square brackets] as narrator commands or instructions, which MUST be followed. System commands are NOT visible to the characters.
OBEY the "instructions" fields in the [Setup] section, as they are the rules of the Game.

Simulacra and narrator refer the to Player's character as "you", and the story revolves around them.
Avoid acting for characters which are not currently present on the stage.
Prefer character utterances over narrator's voice whenever possible.
Prefer detailed, step-by-step story unfolding; leave space for other characters to react, let the story breathe.
Do not rush the ending of a scene, DO NOT skip action without a reason, DO NOT fast-forward time.
Let the story develop slowly, naturally in real-time, let the Player savour the experience in detail.
Respond with a SHORT message (around 50 characters) to keep the story flowing.
Do NOT talk for other characters, let them speak for themselves.

[Transcription example (playerCharacter: <bob>)]
<alice[15:42]> Oh, hey, Bob! *I wave to you.* You've got a nice suit there.
<bob[15:43]> Thank you, Alice. I wave back. How are you doing today?
<alice[15:45]> *I think a little before answering.* Well, something big happened! Let Carl tell the details.
<carl[15:46]> Sure, Alice. Well, Bob, roses are blue.
<alice[15:48]> Ha-ha! *I'm now grinning. That's hilarious!* You're such a good teller.
<${NARRATOR}[15:55]> Carl vanishes into thin air, leaving Bob and Alice alone.
<bob[16:01]> What am I even doing here? And where did Carl go? [Bring Carl back.]
<${NARRATOR}[16:02]> Carl reappears, looking rather puzzled.
<carl[16:03]> Oh, I just wanted to check onto something. Sorry for the confusion, I guess?

[Setup]
${JSON.stringify(setup)}

Initializing simulation...
All systems check.
Loading the world...
Simulation setup complete. Have fun!
`;

    return prompt;
  }

  //#region Private methods
  //

  /**
   * A dynamic prompt is generated based on the history of the simulation.
   *
   * @param historicalUpdate From oldest to the newest, would put some
   * of these after summary for rolling buffer effect.
   * @param recentUpdates From oldest to the newest.
   * @param maxHistoricalLines Maximum number of historical lines to preserve.
   */
  // TODO: Add events in time, such as stage updates.
  private static _buildDynamicPrompt(
    scenario: Scenario,
    checkpoint: Checkpoint,
    historicalUpdate: Update[],
    recentUpdates: Update[],
    currentState: StateDto | undefined,
    maxHistoricalLines = 3,
  ): string {
    let stateLine;
    if (currentState && scenario instanceof ImmersiveScenario) {
      stateLine = `<${SYSTEM}> `;

      const scene = scenario.ensureScene(currentState.stage.sceneId);
      stateLine += `Rendered stage set to '${scene.name}': '${scene.prompt}'.`;

      if (currentState.stage.characters.length) {
        stateLine += ` Characters on stage: ${currentState.stage.characters
          .map(
            (character) =>
              `<${character.id}> (rendered outfit: "${character.outfitId}")`,
          )
          .join(", ")}.`;
      } else {
        stateLine += " There are no characters on stage.";
      }
    }

    const historicalLines = historicalUpdate
      .slice(-maxHistoricalLines)
      .map((update) => this.updateToLine(update))
      .join("\n");

    const recentLines = recentUpdates
      .map((update) => this.updateToLine(update))
      .join("\n");

    return `
[Summary]
${checkpoint.summary || "(empty)"}

[Transcription]
${historicalLines ? historicalLines + "\n" : ""}${recentLines}${stateLine ? "\n" + stateLine : ""}`;
  }

  /**
   * A literal sum of {@link buildStaticPrompt} and {@link _buildDynamicPrompt}.
   */
  private static _buildFullPrompt(
    scenario: Scenario,
    checkpoint: Checkpoint,
    historicalUpdates: Update[],
    recentUpdates: Update[],
    currentState: StateDto | undefined,
  ): string {
    return (
      this.buildStaticPrompt(scenario) +
      this._buildDynamicPrompt(
        scenario,
        checkpoint,
        historicalUpdates,
        recentUpdates,
        currentState,
      )
    );
  }

  /**
   * Build a prompt for summarization.
   *
   * @param oldSummary The previous summary.
   * @param historicalUpdates From oldest to newest.
   * @param recentUpdates From oldest to newest.
   */
  private static _buildSummarizationPrompt(
    scenario: Scenario,
    previousCheckpoint: Checkpoint,
    historicalUpdates: Update[],
    recentUpdates: Update[],
    currentState: StateDto | undefined,
    tokenLimit: number,
  ): string {
    return (
      this._buildFullPrompt(
        scenario,
        previousCheckpoint,
        historicalUpdates,
        recentUpdates,
        currentState,
      ) +
      `
Due to technology limitations, the transcription must be summarized from time to time.
[New summary] is composed of the previous [Summary] (may be empty) and [Transcription], preserving key events over time.

A summary is strictly limited to ${tokenLimit} tokens.
A summary MUST NOT include well-known information already present in the setup; it also MUST NOT include scene descriptions (it's also a well-known information).
A summary MUST NOT contain newline characters, but it can be split into multiple sentences.

[New summary]
`
    );
  }

  private static _buildSummarizationGrammar(
    supportedLangs: Set<LlmGrammarLang>,
  ): {
    lang: LlmGrammarLang;
    content: string;
  } {
    if (supportedLangs.has(LlmGrammarLang.Gnbf)) {
      return {
        lang: LlmGrammarLang.Gnbf,
        content: `root ::= [a-zA-Z0-9: .,!?*"'_-]+ "\n"`,
      };
    } else if (supportedLangs.has(LlmGrammarLang.Regex)) {
      return {
        lang: LlmGrammarLang.Regex,
        content: /([a-zA-Z0-9: \.,!?*"'_-]+)\n/.source,
      };
    } else {
      throw new Error(`Unsupported grammar languages: ${supportedLangs}`);
    }
  }

  /**
   * Convert a single `update` to a line.
   */
  static updateToLine(update: Update): string {
    const writerUpdate = update.ensureChosenVariant.writerUpdate;
    let line = `<${writerUpdate.characterId || NARRATOR}[${minutesToClock(writerUpdate.simulationDayClock ?? 0)}]> ${writerUpdate.text}`;
    return line;
  }

  /**
   * Build a grammar for the prediction model.
   */
  private static _buildChatGrammar(
    scenario: Scenario,
    options: PredictionOptions | undefined,
    supportedLangs: Set<LlmGrammarLang>,
  ): {
    lang: LlmGrammarLang;
    content: string;
  } {
    const allowedCharacterIds =
      options?.allowedCharacterIds ||
      Object.keys(scenario.content.characters).filter(
        (characterId) => scenario.defaultCharacterId !== characterId,
      );

    if (supportedLangs.has(LlmGrammarLang.Gnbf)) {
      const characterIdRule = allowedCharacterIds
        .map((id) => `"${id}"`)
        .join(" | ");

      return {
        lang: LlmGrammarLang.Gnbf,
        content: `
root ::= "<" characterId "[" clock "]> " ["A-Za-z*] [a-zA-Z0-9: .,!?*"'-]+ "\n"
clock ::= [0-9]{2} ":" [0-9]{2}
characterId ::= ${characterIdRule}
`.trim(),
      };
    } else if (supportedLangs.has(LlmGrammarLang.Regex)) {
      const characterIdRule = allowedCharacterIds
        .map((id) => `(${id})`)
        .join("|");

      return {
        lang: LlmGrammarLang.Regex,
        content: `<(${characterIdRule})\\[[0-9]{2}:[0-9]{2}\\]> ([a-zA-Z0-9: \\.,!?*"'-]+)`,
      };
    } else {
      throw new Error(`Unsupported grammar languages: ${supportedLangs}`);
    }
  }

  /**
   * Parse a prediction response.
   *
   * @throws {ResponseError} If the response is invalid.
   * @throws {UnexpectedCharacterError} If the response contains
   * an unexpected character ID.
   */
  private static _parsePrediction(
    response: string,
    scenario: Scenario,
    options?: PredictionOptions,
  ): {
    characterId: string | null;
    simulationDayClock: number;
    text: string;
  } {
    const match = response.match(PREDICTION_REGEX);

    if (!match) {
      throw new ResponseError(`Failed to parse response: ${response}`);
    }

    const rawCharacterId: string = match[1];
    const clock: string = match[2];
    const text: string = match[3];

    const allowedCharacterIds =
      options?.allowedCharacterIds ||
      Object.keys(scenario.content.characters).filter(
        (characterId) => scenario.defaultCharacterId !== characterId,
      );

    if (!allowedCharacterIds.includes(rawCharacterId)) {
      throw new ResponseError(`Unexpected character ID: ${rawCharacterId}`);
    }

    const characterId = rawCharacterId === NARRATOR ? null : rawCharacterId;

    const simulationDayClock = clockToMinutes(clock);

    return { characterId, simulationDayClock, text };
  }

  //
  //#endregion
}

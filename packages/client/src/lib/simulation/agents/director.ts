import {
  LlmGrammarLang,
  type BaseLlmDriver,
  type CompletionOptions,
} from "@/lib/ai/llm/BaseLlmDriver";
import type { d } from "@/lib/drizzle";
import { safeParseJson, trimEndAny, unreachable } from "@/lib/utils";
import { formatIssues, v } from "@/lib/valibot";
import { computed, ref, shallowRef, type ShallowRef } from "vue";
import { IdSchema, Scenario } from "../scenario";
import { State, type StateDto } from "../state";
import { type StateCommand } from "../state/commands";

export type SimpleUpdate = {
  characterId: string | null;
  text: string;
  state?: StateDto;
};

export type PredictionOptions = {
  /**
   * If set, only these characters may be added to the stage.
   */
  charactersAllowedToEnterTheStage?: string[];
};

export class PredictionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PredictionParseError";
  }
}

const PredictionSchema = v.object({
  scene: v.string(),
  characters: v.record(
    IdSchema,
    v.object({ outfit: IdSchema, emotion: IdSchema }),
  ),
});

export class Director {
  readonly contextSize = computed(() => this.llmDriver.value?.contextSize);
  readonly contextLength = ref<number | undefined>();
  readonly llmDriver: ShallowRef<BaseLlmDriver | null>;
  readonly ready = computed(() => this.llmDriver.value?.ready.value);

  constructor(
    llmDriver: BaseLlmDriver | null,
    private scenario: Scenario,
  ) {
    this.llmDriver = shallowRef(llmDriver);
  }

  /**
   * Infer an update that should be made to the current state.
   *
   * @param historicalUpdates The updates that have been made prior to the current state.
   * @param currentState The actual state of the simulation.
   * @param incomingUpdates The updates that have been made recently.
   *
   * @throws {EngineCodeSemanticError} If the inference result
   * is not a valid state command.
   */
  async inferUpdate(
    historicalUpdates: SimpleUpdate[],
    currentState: Readonly<StateDto>,
    incomingUpdates: SimpleUpdate[],
    nEval: number,
    inferenceOptions?: CompletionOptions,
    predictionOptions?: PredictionOptions,
    onDecodeProgress?: (event: { progress: number }) => void,
    onInferenceProgress?: (event: { content: string }) => void,
    inferenceAbortSignal?: AbortSignal,
  ): Promise<
    {
      completion: typeof d.llmCompletions.$inferSelect;
    } & ({ delta: StateCommand[] } | { error: PredictionError })
  > {
    if (!this.llmDriver.value) throw new Error("Driver is not set");
    if (!this.llmDriver.value.ready.value) {
      throw new Error("Driver is not ready");
    }

    const staticPrompt = Director.buildStaticPrompt(this.scenario);
    const dynamicPrompt = Director._buildDynamicPrompt(
      historicalUpdates,
      incomingUpdates,
    );

    const prompt = `${staticPrompt}${dynamicPrompt}<|end|>\n<|assistant|>`;

    // Combine explicitly allowed characters with the characters
    // that are already on the stage to get the full set of allowed characters.
    const allowedCharacterIdsArray =
      predictionOptions?.charactersAllowedToEnterTheStage || [];
    allowedCharacterIdsArray.push(
      ...Object.keys(currentState.stage.characters),
    );
    const allowedCharacterIds = new Set(allowedCharacterIdsArray);

    const stopSequences = ["<|end|>"];
    const options: CompletionOptions = {
      grammar: Director._buildGrammar(
        this.scenario,
        this.llmDriver.value.grammarLang,
        Array.from(allowedCharacterIds),
      ),
      stopSequences,
      ...inferenceOptions,
    };

    console.log("Inferring director update", prompt, options, nEval);

    const inferenceResult = await this.llmDriver.value.createCompletion(
      prompt,
      nEval,
      options,
      onDecodeProgress,
      onInferenceProgress,
      inferenceAbortSignal,
    );

    console.log("Inference result", inferenceResult);

    if (inferenceResult.aborted) {
      return {
        completion: inferenceResult.completion,
        error: new PredictionError("Inference was aborted"),
      };
    }

    if (!inferenceResult.completion.output) {
      return {
        completion: inferenceResult.completion,
        error: new PredictionError("Inference produced no output"),
      };
    }

    const trimmedOutput = trimEndAny(
      inferenceResult.completion.output,
      stopSequences,
    );

    console.log("Output", trimmedOutput);

    // FIXME: Possible duplicate character IDs.
    const json = safeParseJson(trimmedOutput);
    if (!json.success) {
      return {
        completion: inferenceResult.completion,
        error: new PredictionError(
          `Failed to parse prediction JSON: ${json.error}`,
        ),
      };
    }

    const prediction = v.safeParse(PredictionSchema, json.output);
    if (!prediction.success) {
      return {
        completion: inferenceResult.completion,
        error: new PredictionError(
          `Failed to parse prediction object: ${formatIssues(prediction.issues)}`,
        ),
      };
    }

    const predictedState: StateDto = {
      stage: {
        sceneId: prediction.output.scene,
        characters: Object.entries(prediction.output.characters).map(
          ([characterId, character]) => ({
            id: characterId,
            expressionId: character.emotion,
            outfitId: character.outfit,
          }),
        ),
      },
    };

    const delta = State.delta(predictedState, currentState);

    return {
      completion: inferenceResult.completion,
      delta: delta,
    };
  }

  /**
   * Build a static prompt for the director agent.
   */
  static buildStaticPrompt(scenario: Scenario): string {
    const setup = {
      locations: Object.fromEntries(
        Object.values(scenario.locations).map((location) => [
          location.name,
          location.prompt,
        ]),
      ),
      scenes: Object.fromEntries(
        Object.entries(scenario.scenes).map(([sceneId, scene]) => [
          sceneId,
          scene.name,
        ]),
      ),
      characters: Object.fromEntries(
        Object.entries(scenario.characters).map(([characterId, character]) => [
          characterId,
          {
            fullName: character.fullName,

            // Used to identify a character.
            appearance: character.appearancePrompt,

            // For emotional consistency.
            psychologicalTraits: character.psychologicalTraits,
            // relationships: character.relationships, // Not enough context.

            outfits: Object.fromEntries(
              Object.entries(character.outfits).map(([outfitId, outfit]) => [
                outfitId,
                outfit.name,
              ]),
            ),

            emotions: character.expressions,
          },
        ]),
      ),
    };

    return `<|system|>
Below is an instruction that describes a task. Write a response that appropriately completes the request.
## Instruction
You are an AI agent responsible for synchronizing the state of a simulation. The simulation consists of a series of scenes, characters, and their interactions. Your task is to generate a response that updates the simulation state based on the latest incoming messages, using the data provided in the [Simulation setup] section. Respond with a JSON which resembles the new contrived state as close as possible, picking up the most appropriate IDs from the setup. It is perfectly fine to leave some fields unchanged if they are not affected by the incoming messages, or even to respond with the same state if no changes are necessary. Change character emotions frequently, align their emotions with psychological traits, if supplied. Do not be proactive, apply changes only when instucted by the incoming messages; for example, a bare intention to leave the room does not immedately results in scene change; instead, wait for the characters to act on it.
### Example
#### Historical updates
<alice> Hello, world!
{"scene":"intRoom","characters":{"alice":{"outfit":"dress","emotion": "smiling"}}}
#### Incoming updates
<bob> *I enter the room, wearing a hat.* How are you doing?
#### New state
{"scene":"intRoom","characters":{"alice":{"outfit":"dress","emotion":"smiling-more"},"bob":{"outfit":"suit","emotion": "neutral"}}}
### Example
#### Historical updates
<bob> I think it's a good idea to go for a walk.
{"scene":"intRoom","characters":{"alice":{"outfit":"pajamas","emotion":"neutral"},"bob":{"outfit":"suit","emotion":"neutral"}}}
<alice> *I nod.* I agree.
{"scene":"intRoom","characters":{"alice":{"outfit":"pajamas","emotion":"smile"},"bob":{"outfit":"suit","emotion":"neutral"}}}
#### Incoming updates
<narrator> A few minutes later, they leave the room and go for a walk.
<alice> Such a beautiful day!
#### New state
{"scene":"extPark","characters":{"alice":{"outfit":"dress","emotion":"happy"},"bob":{"outfit":"suit","emotion":"happy"}}}
### Simulation setup
${JSON.stringify(setup)}
`;
  }

  private static _stateToDirectorState(state: StateDto): string {
    return JSON.stringify({
      scene: state.stage.sceneId,
      characters: Object.fromEntries(
        state.stage.characters.map((character) => [
          character.id,
          {
            outfit: character.outfitId,
            emotion: character.expressionId,
          },
        ]),
      ),
    });
  }

  /**
   * Build a dynamic prompt for the director agent.
   *
   * ```plaintext
   * ### Historical updates
   * <alice> Hello, world!
   * {"scene":"foo","characters":{"alice":{"outfit":"bar","emotion": "baz"}}}
   * ### Incoming updates
   * <bob> A beautiful day indeed! *I enter the room.*
   * ```
   */
  private static _buildDynamicPrompt(
    historicalUpdates: SimpleUpdate[],
    incomingUpdates: SimpleUpdate[],
  ): string {
    let text = `### Historical updates\n`;

    text += historicalUpdates
      .map((update) => {
        let text = `<${update.characterId || "narrator"}> ${update.text}`;
        if (update.state) {
          text += `\n${Director._stateToDirectorState(update.state)}`;
        }
        return text;
      })
      .join("\n");

    text += `\n### Incoming updates\n`;

    text += incomingUpdates
      .map((u) => `<${u.characterId || "narrator"}> ${u.text}`)
      .join("\n");

    return text;
  }

  private static _buildGrammar(
    scenario: Scenario,
    lang: LlmGrammarLang,
    allowedCharacterIds: string[],
  ): string {
    switch (lang) {
      case LlmGrammarLang.Gnbf:
        return Director._buildGrammarGnbf(scenario, allowedCharacterIds);
      case LlmGrammarLang.Regex:
        return Director._buildGrammarRegex(scenario, allowedCharacterIds);
      default:
        throw unreachable(lang);
    }
  }

  /**
   * Build a GNBF grammar to constrain director output.
   * @see https://github.com/ggerganov/llama.cpp/blob/master/grammars/README.md.
   */
  private static _buildGrammarGnbf(
    scenario: Scenario,
    allowedCharacterIds: string[],
  ): string {
    const rules: Record<string, string> = {};

    rules["scene-id"] = `${Object.keys(scenario.scenes)
      .map((sceneId) => `"\\"${sceneId}\\""`)
      .join("|")}`;

    for (const [characterId, character] of Object.entries(
      scenario.characters,
    ).filter(([characterId]) => allowedCharacterIds.includes(characterId))) {
      const outfitIds = Object.keys(character.outfits)
        .map((id) => `"\\"${id}\\""`)
        .join("|");

      const emotionIds = character.expressions
        .map((id) => `"\\"${id}\\""`)
        .join("|");

      rules[`character-${characterId}`] =
        `"\\"${characterId}\\":{\\"outfit\\":"(${outfitIds})",\\"emotion\\":"(${emotionIds})"}"`;
    }

    rules["character"] = Object.keys(scenario.characters)
      .filter((charactedId) => allowedCharacterIds.includes(charactedId))
      .map((characterId) => `character-${characterId}`)
      .join("|");

    rules["root"] =
      `"{\\"scene\\":"scene-id",\\"characters\\":{"(character(","character)*)?"}}"`;

    return Object.entries(rules)
      .map(([name, rule]) => `${name}::=${rule}`)
      .join("\n");
  }

  /**
   * Build a Regex grammar to constrain director output.
   * @see https://outlines-dev.github.io/outlines/reference/regex.
   */
  private static _buildGrammarRegex(
    scenario: Scenario,
    allowedCharacterIds: string[],
  ): string {
    throw new Error("Not implemented");
  }
}

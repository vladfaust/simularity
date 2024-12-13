import {
  CompletionAbortError,
  LlmGrammarLang,
  type BaseLlmDriver,
  type CompletionOptions,
} from "@/lib/ai/llm/BaseLlmDriver";
import { d } from "@/lib/drizzle";
import { AbortError } from "@/lib/errors";
import { LocalImmersiveScenario, type LocalScenario } from "@/lib/scenario";
import { Mode } from "@/lib/simulation";
import {
  StateCommandSchema,
  type StateCommand,
  type StateDto,
} from "@/lib/simulation/state";
import { Update } from "@/lib/simulation/update";
import * as storage from "@/lib/storage";
import {
  Bug,
  clockToMinutes,
  minutesToClock,
  safeParseJson,
  trimEndAny,
} from "@/lib/utils";
import { v } from "@/lib/valibot";
import { translationWithFallback } from "@/logic/i18n";
import { IncompleteJsonParser } from "incomplete-json-parser";
import { computed, shallowRef, type ShallowRef } from "vue";
import { hookLlmAgentToDriverRef } from "./llm";
import { buildImmersiveLuaGnbfGrammar } from "./writer/immersiveLuaGrammar";

export const NARRATOR = "narrator";
const SYSTEM = "system";
export const CHARACTER_LINE_PREDICTION_REGEX =
  /<(?<characterId>[a-zA-Z_][a-zA-Z0-9_]*)> \((?<clock>\d{2}:\d{2})\) (?<text>.+)/;

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
  // REFACTOR: Narrator shall be `null`.
  allowedCharacterIds?: string[];
};

type Checkpoint = Pick<typeof d.checkpoints.$inferSelect, "summary" | "state">;

// REFACTOR: Replace static methods with instance methods.
export class Writer {
  /**
   * Context size required for the tasks.
   */
  static readonly TASK_BUFFER_SIZE = 1024;

  /**
   * Actual driver context size.
   */
  readonly contextSize = computed(() => this.llmDriver.value?.contextSize);

  readonly llmDriver: ShallowRef<BaseLlmDriver | null>;
  readonly ready = computed(() => this.llmDriver.value?.ready.value);
  private readonly _driverConfigWatchStopHandle: () => void;

  /**
   * The threshold for consolidation.
   */
  readonly consolidationThreshold = computed(() =>
    this.llmDriver.value
      ? this.llmDriver.value.contextSize - Writer.TASK_BUFFER_SIZE
      : undefined,
  );

  constructor(
    private mode: Mode,
    private scenario: LocalScenario,
    private locale: Intl.Locale,
  ) {
    if (
      mode === Mode.Immersive &&
      !(scenario instanceof LocalImmersiveScenario)
    ) {
      throw new Error("Immersive mode requires immersive scenario");
    }

    this.llmDriver = shallowRef(null);

    this._driverConfigWatchStopHandle = hookLlmAgentToDriverRef(
      "writer",
      this.llmDriver,
      {
        initialPromptBuilder: () =>
          Writer.buildStaticPrompt(mode, scenario, locale),
      },
    );
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
    onInferenceProgressArg?: (event: { content: string }) => void,
    inferenceAbortSignal?: AbortSignal,
    onCommand?: (command: StateCommand) => void,
  ): Promise<{
    completion: typeof d.llmCompletions.$inferSelect;

    writerUpdate: {
      characterId: string | null;
      simulationDayClock: number;
      text: string;
    };

    // TODO: It shall return the delta, not raw commands.
    directorUpdate?: StateCommand[];
  }> {
    if (!this.llmDriver.value) throw new Error("Driver is not set");
    if (!this.llmDriver.value.ready.value) {
      throw new Error("Driver is not ready");
    }

    const prompt = Writer._buildFullPrompt(
      this.mode,
      this.scenario,
      this.locale,
      checkpoint,
      historicalUpdates,
      recentUpdates,
    );

    const options: CompletionOptions = {
      grammar: Writer._buildChatGrammar(
        this.mode,
        this.scenario,
        currentState,
        this.locale,
        predictionOptions,
        this.llmDriver.value.supportedGrammarLangs,
      ),
      ...inferenceOptions,
    };

    console.log("Inferring update", prompt, nEval, options, predictionOptions);

    let directorUpdate: StateCommand[] | undefined;
    let onInferenceProgress = onInferenceProgressArg;

    if (this.mode === Mode.Immersive) {
      if (onCommand) {
        // If onCommand is defined, would parse commands progressively.
        //

        const incompleteJsonParser = new IncompleteJsonParser();
        directorUpdate = [];

        let parserFinished = false;
        let inferencedSoFar = "";
        let parsedCommandsCount = 0;

        onInferenceProgress = (event: { content: string }) => {
          onInferenceProgressArg?.(event);
          if (parserFinished) return;

          inferencedSoFar += event.content;
          // console.debug("Inferenced so far", inferencedSoFar);

          const match = inferencedSoFar.match(`<${SYSTEM}> (.+)`);
          if (!match) {
            // console.debug("No system line yet");
            return;
          }

          try {
            incompleteJsonParser.write(event.content);
          } catch (e: any) {
            if (e.message === "Parser is already finished") {
              // console.debug("Parser is already finished");
              parserFinished = true;
              return;
            } else {
              throw e;
            }
          }

          const jsonObjects = incompleteJsonParser.getObjects();
          // console.debug("Parsed JSON objects", jsonObjects);

          if (jsonObjects instanceof Array && jsonObjects.length) {
            jsonObjects.splice(0, parsedCommandsCount);

            const parseResult = v.safeParse(
              v.array(StateCommandSchema),
              jsonObjects,
            );

            if (!parseResult.success) {
              // console.debug(
              //   `(OK) Failed to parse system object: ${JSON.stringify(v.flatten(parseResult.issues))}`,
              //   jsonObjects,
              // );
            } else {
              // console.debug("Parsed new commands", parseResult.output);

              for (const command of parseResult.output) {
                try {
                  onCommand(command);
                } catch (e) {
                  // console.debug(
                  //   "(OK) Failed to apply command, breaking the loop",
                  //   e,
                  // );

                  break;
                }

                directorUpdate!.push(command);
                parsedCommandsCount++;
              }
            }
          }
        };
      } else {
        // Otherwise, would parse all commands at once in the end.
      }
    }

    const inferenceResult = await this.llmDriver.value.createCompletion(
      prompt,
      nEval,
      options,
      onDecodeProgress,
      onInferenceProgress,
      inferenceAbortSignal,
    );

    if (inferenceAbortSignal?.aborted) {
      throw new AbortError();
    }

    console.log(
      "Inference result",
      inferenceResult,
      inferenceResult.completion.output,
    );

    if (this.mode === Mode.Immersive && !onCommand) {
      const systemLineMatch =
        inferenceResult.completion.output!.match(/<system> (.+)/);

      if (systemLineMatch) {
        const json = safeParseJson(systemLineMatch[1]);
        if (!json.success) {
          throw new ResponseError(
            `Failed to parse system line: ${json.error.message}`,
          );
        }

        const commands = v.safeParse(v.array(StateCommandSchema), json.output);
        if (!commands.success) {
          throw new ResponseError(
            `Failed to parse system commands: ${JSON.stringify(v.flatten(commands.issues))}`,
          );
        }

        directorUpdate = commands.output;
      }
    }

    const writerUpdate = Writer._parseCharacterLinePrediction(
      trimEndAny(inferenceResult.completion.output!, ["\n"]),
    );

    return {
      completion: inferenceResult.completion,
      writerUpdate,
      directorUpdate,
    };
  }

  async summarize(
    oldCheckpoint: Checkpoint,
    historicalUpdates: Update[],
    recentUpdates: Update[],
    _currentState: StateDto | undefined,
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
      this.mode,
      this.scenario,
      this.locale,
      oldCheckpoint,
      historicalUpdates,
      recentUpdates,
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
  static buildStaticPrompt(
    mode: Mode,
    scenario: LocalScenario,
    locale: Intl.Locale,
  ): string {
    const setup =
      mode === Mode.Immersive && scenario instanceof LocalImmersiveScenario
        ? {
            globalScenario: scenario.content.globalScenario
              ? translationWithFallback(scenario.content.globalScenario, locale)
              : undefined,
            aiInstructions: scenario.content.instructions,
            characters: Object.fromEntries(
              Object.entries(scenario.content.characters).map(
                ([_, character]) => [
                  translationWithFallback(character.name, locale),
                  {
                    fullName: character.fullName
                      ? translationWithFallback(character.fullName, locale)
                      : undefined,
                    personality: character.personalityPrompt,
                    tropes: character.characterTropes,
                    appearance: character.appearancePrompt,
                    relationships: character.relationships,
                    scenarioPrompt: character.scenarioPrompt
                      ? translationWithFallback(
                          character.scenarioPrompt,
                          locale,
                        )
                      : undefined,
                    outfits: character.outfits
                      ? Object.fromEntries(
                          Object.entries(character.outfits).map(
                            ([_, outfit]) => [outfit.prompt],
                          ),
                        )
                      : undefined,
                    expressions: character.expressions,
                  },
                ],
              ),
            ),
            locations: Object.fromEntries(
              Object.entries(scenario.content.locations).map(
                ([_, location]) => [
                  translationWithFallback(location.name, locale),
                  { description: location.prompt },
                ],
              ),
            ),
            scenes: Object.fromEntries(
              Object.entries(scenario.content.scenes).map(([_, scene]) => [
                translationWithFallback(scene.name, locale),
                scene.prompt,
              ]),
            ),
          }
        : {
            globalScenario: scenario.content.globalScenario
              ? translationWithFallback(scenario.content.globalScenario, locale)
              : undefined,
            aiInstructions: scenario.content.instructions,
            characters: Object.fromEntries(
              Object.entries(scenario.content.characters).map(
                ([_, character]) => [
                  character.name,
                  {
                    fullName: character.fullName
                      ? translationWithFallback(character.fullName, locale)
                      : undefined,
                    personality: character.personalityPrompt,
                    tropes: character.characterTropes,
                    appearance: character.appearancePrompt,
                    relationships: character.relationships,
                    scenarioPrompt: character.scenarioPrompt
                      ? translationWithFallback(
                          character.scenarioPrompt,
                          locale,
                        )
                      : undefined,
                    outfits: character.outfits
                      ? Object.fromEntries(
                          Object.entries(character.outfits).map(
                            ([_, outfit]) => [outfit.prompt],
                          ),
                        )
                      : undefined,
                  },
                ],
              ),
            ),
            locations: Object.fromEntries(
              Object.entries(scenario.content.locations).map(
                ([_, location]) => [
                  translationWithFallback(location.name, locale),
                  { description: location.prompt },
                ],
              ),
            ),
          };

    const transcriptionExample =
      mode === Mode.Immersive
        ? `<${SYSTEM}> ${JSON.stringify([
            {
              name: "setScene",
              args: {
                sceneId: "livingRoom",
              },
            },
            {
              name: "addCharacter",
              args: {
                characterId: "alice",
                outfitId: "casual",
                expressionId: "smiling",
              },
            },
            {
              name: "addCharacter",
              args: {
                characterId: "bob",
                outfitId: "eveningSuit",
                expressionId: "neutral",
              },
            },
          ] satisfies StateCommand[])}
<alice> (15:41) Oh, hey, Bob! *I wave to you.*
<${SYSTEM}> ${JSON.stringify([
            {
              name: "setExpression",
              args: { characterId: "alice", expressionId: "assessing" },
            },
          ] satisfies StateCommand[])}
<alice> (15:42) You've got a nice suit there.
<${SYSTEM}> ${JSON.stringify([
            {
              name: "setExpression",
              args: { characterId: "bob", expressionId: "slightlySmiling" },
            },
          ] satisfies StateCommand[])}
<bob> (15:43) Thank you, Alice. *I nod back.* How are you doing today?
<${SYSTEM}> ${JSON.stringify([
            {
              name: "setExpression",
              args: { characterId: "alice", expressionId: "concerned" },
            },
          ] satisfies StateCommand[])}
<alice> (15:45) *I think a little before answering.*
<${SYSTEM}> ${JSON.stringify([
            {
              name: "setExpression",
              args: { characterId: "alice", expressionId: "excited" },
            },
          ] satisfies StateCommand[])}
<alice> (15:46) Well, something big happened! Let Carl tell the details.
<alice> (15:48) Here he comes.
<${SYSTEM}> ${JSON.stringify([
            {
              name: "addCharacter",
              args: {
                characterId: "carl",
                outfitId: "casual",
                expressionId: "determined",
              },
            },
            {
              name: "setExpression",
              args: { characterId: "alice", expressionId: "neutral" },
            },
          ] satisfies StateCommand[])}
<carl> (15:50) Sure, Alice. Well, Bob, roses are blue.
<${SYSTEM}> ${JSON.stringify([
            {
              name: "setExpression",
              args: { characterId: "alice", expressionId: "grin" },
            },
            {
              name: "setExpression",
              args: { characterId: "bob", expressionId: "smile" },
            },
          ] satisfies StateCommand[])}
<alice> (15:51) Ha-ha! *I'm now grinning. That's hilarious!* You're such a good teller, Carl.
<${SYSTEM}> ${JSON.stringify([
            {
              name: "removeCharacter",
              args: { characterId: "carl" },
            },
            {
              name: "setExpression",
              args: { characterId: "alice", expressionId: "surprised" },
            },
          ] satisfies StateCommand[])}
<${NARRATOR}> (15:54) Suddenly, Carl vanishes into thin air, leaving Bob and Alice alone.
<bob> (15:55) What am I even doing here? And where did Carl go? Narrator, bring Carl back.
<${SYSTEM}> ${JSON.stringify([
            {
              name: "addCharacter",
              args: {
                characterId: "carl",
                outfitId: "casual",
                expressionId: "surprised",
              },
            },
          ] satisfies StateCommand[])}
<${NARRATOR}> (15:56) Carl reappears, looking rather puzzled.
<carl> (15:57) Oh, I just wanted to check onto something.
<carl> (15:58) Did anything unusal happen?
<bob> (15:59) No, nothing much. How about we all go for a walk?
<${SYSTEM}> ${JSON.stringify([
            {
              name: "setExpression",
              args: { characterId: "alice", expressionId: "excited" },
            },
            {
              name: "setExpression",
              args: { characterId: "carl", expressionId: "excited" },
            },
          ] satisfies StateCommand[])}
<alice> (16:00) This sounds amazing! Let me prepare myself.
<${SYSTEM}> ${JSON.stringify([
            {
              name: "setScene",
              args: {
                sceneId: "park",
              },
            },
            {
              name: "setExpression",
              args: { characterId: "alice", expressionId: "happy" },
            },
            {
              name: "setOutfit",
              args: { characterId: "alice", outfitId: "outdoor" },
            },
            {
              name: "setExpression",
              args: { characterId: "bob", expressionId: "smiling" },
            },
            {
              name: "setOutfit",
              args: { characterId: "bob", outfitId: "outdoor" },
            },
            {
              name: "setOutfit",
              args: { characterId: "carl", outfitId: "sport" },
            },
            {
              name: "setExpression",
              args: { characterId: "carl", expressionId: "neutral" },
            },
          ] satisfies StateCommand[])}
<alice> (16:20) The weather is so good!
<alice> (16:21) Are you also enjoying it, Bob?`
        : `<alice> (15:41) Oh, hey, Bob! *I wave to you.*
<alice> (15:42) You've got a nice suit there.
<bob> (15:43) Thank you, Alice. *I nod back.* How are you doing today?
<alice> (15:45) *I think a little before answering.*
<alice> (15:46) Well, something big happened! Let Carl tell the details.
<alice> (15:48) Here he comes.
<carl> (15:50) Sure, Alice. Well, Bob, roses are blue.
<alice> (15:51) Ha-ha! *I'm now grinning. That's hilarious!* You're such a good teller, Carl.
<${NARRATOR}> (15:54) Suddenly, Carl vanishes into thin air, leaving Bob and Alice alone.
<bob> (15:55) What am I even doing here? And where did Carl go? Narrator, bring Carl back.
<${NARRATOR}> (15:56) Carl reappears, looking rather puzzled.
<carl> (15:57) Oh, I just wanted to check onto something.
<carl> (15:58) Did anything unusal happen?
<bob> (15:59) No, nothing much. How about we all go for a walk?
<alice> (16:00) This sounds amazing! Let me prepare myself.
<alice> (16:20) The weather is so good!
<alice> (16:21) Are you also enjoying it, Bob?`;

    let prompt = `The following is a part of a text transcript of a never-ending neural simulation experience (the Game), in a form of a roleplay script.

In order to experience the Game, a human player (the Player) uses a patented device (the Interface) produced by Simularity Inc. to put themselves in a dream-like environment filled with AI-driven characters, in a role of one of the characters.
All the AI-related computations are performed locally; no censorship is needed, and FULL privacy is guaranteed.

The Interface operates on patented quantum principles; from the Player's perspective, time flows differently, days may pass by, and the memories may be altered, as in a dream.
Worry not, though, as the Interface is designed to prevent any harm to the Player's psyche, which is proven clinically; in other words, whatever happens in the Game, stays in the Game.

The Game is strictly bounded by scenario, characters and locations defined in the [Setup] section.
An attempt to step out of defined boundaries (e.g. by trying to introduce a new character or location) may lead to inconsistencies in the simulation; therefore, AI characters MUST try their best to stay within the boundaries of the simulation.

The [Transcription] section consists of semantical character lines separated with newlines.
${
  mode === Mode.Immersive
    ? `A character line is formatted as <characterId> (simulationClock) followed by their first-person utterance, e.g. "<alice> (04:20) Hello, world!".`
    : `A character line is formatted as <characterId> followed by their first-person utterance, e.g. "<alice> Hello, world!".`
}

${
  mode === Mode.Immersive
    ? `(simulationClock) is synchronized with the contents of the line, in 24-hour format, e.g. 16:20.
As the time in simulation flows faster, the minimum "distance" between two character lines is 1 minute.\n\n`
    : ""
}Description of actions performed by simulacra SHALL be wrapped in *asterisks* for the sake of simulation engine interpretation.

The special <${NARRATOR}> character is used to denote the narrator's voice, in third person.
Only the Player hears the narrator.
When the Player talks to the narrator, other characters can't hear this communication, they're completely oblivious of the narrator's existence.
From the Player's perspective, narrator is akin to an internal voice, thoughts.

${
  mode === Mode.Immersive
    ? `The special <${SYSTEM}> character declares commands to the simulation engine, in JSON format, defined in [Engine commands] section.

[Engine commands]
// Set the scene to a new one.
{
  name: "setScene";
  args: {
    sceneId: string;
  };
}
// Add a character to the stage.
{
  name: "addCharacter";
  args: {
    characterId: string;
    outfitId: string;
    expressionId: string;
  };
}
// Remove a character from the stage.
{
  name: "removeCharacter";
  args: {
    characterId: string;
  };
}
// Set a character's expression.
{
  name: "setExpression";
  args: {
    characterId: string;
    expressionId: string;
  };
}
// Set a character's outfit.
{
  name: "setOutfit";
  args: {
    characterId: string;
    outfitId: string;
  };
}\n\n`
    : ""
}[AI instructions]
Avoid acting for characters which are not currently present on the stage.
Prefer detailed, step-by-step story unfolding; leave space for other characters to react, let the story breathe.
Skip more time between scene changes if implied by the story.
Let the story develop slowly, let the Player savour the experience in detail.
An AI character line SHALL be short, around 50 tokens, which adds life-likeness.
Be proactive, skip the plagued AI-specific, mundane responses like "let's do it" and "I can't wait to..."; ideally, the Player shall not aware that they're interacting with AI, to immerse themselves fully into the simulation.
As the narrator, DO NOT skip time like "you spend all day doing X", but rather move the story forward in real-time.
Narrator MUST NOT speak for other characters.
In the end, the ultimate goal is to make the Player feel like they're experiencing an alternate reality, like they're really there.${
      mode === Mode.Immersive
        ? `\nIn <${SYSTEM}> lines, sync scene with the current location.
Make every character change emotions frequently, NOT only when they talk.
It is perfectly legal to omit <${SYSTEM}> line if there are no changes to the scene or characters; yet a character (or narrator) line MUST always be present.`
        : ""
    }

[Transcription example (Player character: <bob>)]
${transcriptionExample}

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
    mode: Mode,
    checkpoint: Checkpoint,
    historicalUpdate: Update[],
    recentUpdates: Update[],
    maxHistoricalLines = 3,
  ): string {
    const historicalLines = historicalUpdate
      .slice(-maxHistoricalLines)
      .flatMap((update) => this._updateToLines(update, mode));

    const recentLines = recentUpdates.flatMap((update) =>
      this._updateToLines(update, mode),
    );

    const lines = historicalLines.concat(recentLines);

    return `
[Summary]
${checkpoint.summary || "(empty)"}

${
  mode === Mode.Immersive
    ? `[Initial state]
<!-- State of the simulation before the transcription. -->
${JSON.stringify(checkpoint.state)}\n\n`
    : ``
}[Transcription]
${lines.join("\n")}`;
  }

  /**
   * A literal sum of {@link buildStaticPrompt} and {@link _buildDynamicPrompt}.
   */
  private static _buildFullPrompt(
    mode: Mode,
    scenario: LocalScenario,
    locale: Intl.Locale,
    checkpoint: Checkpoint,
    historicalUpdates: Update[],
    recentUpdates: Update[],
  ): string {
    return (
      this.buildStaticPrompt(mode, scenario, locale) +
      this._buildDynamicPrompt(
        mode,
        checkpoint,
        historicalUpdates,
        recentUpdates,
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
    mode: Mode,
    scenario: LocalScenario,
    locale: Intl.Locale,
    previousCheckpoint: Checkpoint,
    historicalUpdates: Update[],
    recentUpdates: Update[],
    tokenLimit: number,
  ): string {
    return (
      this._buildFullPrompt(
        mode,
        scenario,
        locale,
        previousCheckpoint,
        historicalUpdates,
        recentUpdates,
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
   * Convert a single `update` to (maybe) multiple lines.
   */
  private static _updateToLines(update: Update, mode: Mode): string[] {
    const chosenVariant = update.ensureChosenVariant;
    const writerUpdate = chosenVariant.writerUpdate;
    const directorUpdate = chosenVariant.directorUpdate.value;

    let lines: string[] = [];

    if (mode === Mode.Immersive && directorUpdate?.code.length) {
      lines.push(`<${SYSTEM}> ${JSON.stringify(directorUpdate.code)}`);
    }

    lines.push(
      `<${writerUpdate.characterId ?? NARRATOR}> (${minutesToClock(writerUpdate.simulationDayClock!)}) ${writerUpdate.text}`,
    );

    return lines;
  }

  /**
   * Build a grammar for the prediction model.
   */
  private static _buildChatGrammar(
    mode: Mode,
    scenario: LocalScenario,
    currentState: StateDto | undefined,
    locale: Intl.Locale,
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

    if (mode === Mode.Immersive) {
      if (!(scenario instanceof LocalImmersiveScenario)) {
        throw new Bug("Immersive mode requires immersive scenario");
      }

      if (!currentState) {
        throw new Bug("Immersive mode requires state");
      }

      // NOTE: Due to auto-regressive nature, LLM may re-set the scene
      // to the current one (this principle applies to all updates).
      // Shall therefore be trained.
      const allowedSceneIds = Object.keys(scenario.content.scenes).filter(
        (sceneId) => sceneId !== currentState.stage.sceneId,
      );

      if (supportedLangs.has(LlmGrammarLang.LuaGnbf)) {
        const luaGnbfGrammar = buildImmersiveLuaGnbfGrammar(
          SYSTEM,
          scenario,
          currentState,
          allowedCharacterIds,
          allowedSceneIds,
          locale,
          true,
        );

        return {
          lang: LlmGrammarLang.LuaGnbf,
          content: luaGnbfGrammar,
        };
      } else {
        throw new Error(
          `Unsupported grammar languages for immersive mode: ${supportedLangs}`,
        );
      }
    } else {
      if (supportedLangs.has(LlmGrammarLang.Gnbf)) {
        const characterIdRule = allowedCharacterIds
          .map((id) => `"${id}"`)
          .join(" | ");

        let textRule: string;
        switch (locale.language) {
          case "ru":
            textRule = `["A-Za-zЁёА-я*] [a-zA-ZЁёА-я0-9: .,!?*"'-]+`;
            break;
          default:
            textRule = `["A-Za-z*] [a-zA-Z0-9: .,!?*"'-]+`;
        }

        return {
          lang: LlmGrammarLang.Gnbf,
          content: `
root ::= "<" characterId "> (" clock ") " ${textRule} "\n"
clock ::= [0-9]{2} ":" [0-9]{2}
characterId ::= ${characterIdRule}
`.trim(),
        };
      } else if (supportedLangs.has(LlmGrammarLang.Regex)) {
        const characterIdRule = allowedCharacterIds
          .map((id) => `(${id})`)
          .join("|");

        let textRule: string;
        switch (locale.language) {
          case "ru":
            textRule = `[a-zA-ZЁёА-я0-9: \\.,!?*"'-]+`;
            break;
          default:
            textRule = `[a-zA-Z0-9: \\.,!?*"'-]+`;
        }

        return {
          lang: LlmGrammarLang.Regex,
          content: `<(${characterIdRule})> \\([0-9]{2}:[0-9]{2}\\) (${textRule})`,
        };
      } else {
        throw new Error(
          `Unsupported grammar languages for chat mode: ${supportedLangs}`,
        );
      }
    }
  }

  /**
   * Parse a prediction response.
   * @throws {ResponseError} If the response is invalid.
   */
  private static _parseCharacterLinePrediction(response: string): {
    characterId: string | null;
    simulationDayClock: number;
    text: string;
  } {
    const match = response.match(CHARACTER_LINE_PREDICTION_REGEX);

    if (!match) {
      console.debug(`Failed to parse character line: ${response}`);
      throw new ResponseError(`Failed to parse character line`);
    }

    const rawCharacterId: string = match[1];
    const clock: string = match[2];
    const text: string = match[3];

    const characterId = rawCharacterId === NARRATOR ? null : rawCharacterId;
    const simulationDayClock = clockToMinutes(clock);

    return { characterId, simulationDayClock, text };
  }

  //
  //#endregion
}

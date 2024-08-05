import { InferenceOptions } from "@/lib/simularity/common";
import {
  Gpt,
  GptDriver,
  InferenceResult,
  StoredGptSession,
} from "@/lib/simularity/gpt";
import { escapeQuotes, safeParseJson } from "@/lib/utils";
import { formatIssues, v } from "@/lib/valibot";
import { Ref, computed } from "vue";
import { Scenario } from "../scenario";
import { StateDto } from "../state";
import {
  StateCommand,
  StateCommandSchema,
  stateCommandToLine,
} from "../state/commands";
import { Update } from "../update";

class CommandParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandParseError";
  }
}

export class Director {
  /**
   * Initialize a new director agent.
   *
   * @param rootState The initial state before any user input.
   * @param recentUpdates The updates that have been made since the root state.
   */
  static async init(
    driver: GptDriver,
    sessionRef: Ref<StoredGptSession | null>,
    scenario: Scenario,
    rootState: StateDto,
    recentUpdates: Update[],
    progressCallback: (event: { progress: number }) => void,
  ): Promise<Director> {
    const staticPrompt = this._buildStaticPrompt(scenario);
    const dynamicPrompt = this._buildDynamicPrompt(rootState, recentUpdates);

    const { gpt } = await Gpt.findOrCreate(
      driver,
      sessionRef,
      staticPrompt,
      dynamicPrompt,
      progressCallback,
    );

    return new Director(scenario, gpt);
  }

  readonly recentPrompt = computed(() => this.gpt.prompt.value);
  readonly contextSize = computed(() => this.gpt.contextSize);
  readonly contextLength = computed(() => this.gpt.contextLength.value);

  /**
   * Infer the update that should be made to the state.
   *
   * @param rootState The initial state before any user input.
   * @param recentUpdates The updates that have been made since the root state.
   *
   * @throws {EngineCodeSemanticError} If the inference result
   * is not a valid state command.
   */
  async inferUpdate(
    rootState: StateDto,
    _actualState: StateDto,
    recentUpdates: Update[],
    nEval: number,
    inferenceOptions?: InferenceOptions,
    onDecodeProgress?: (event: { progress: number }) => void,
    onInferenceProgress?: (event: { content: string }) => void,
    inferenceAbortSignal?: AbortSignal,
  ): Promise<
    {
      inferenceResult: InferenceResult;
    } & ({ parsedCommands: StateCommand[] } | { parseError: CommandParseError })
  > {
    const staticPrompt = Director._buildStaticPrompt(this.scenario);
    const dynamicPrompt = Director._buildDynamicPrompt(
      rootState,
      recentUpdates,
    );

    const prompt = `${staticPrompt}${dynamicPrompt}<|end|>\n<|assistant|>\n`;

    const options: InferenceOptions = {
      grammar: Director._buildGnbf(),
      stopSequences: ["<|end|>"],
      ...inferenceOptions,
    };

    console.log("Inferring director update", prompt, options, nEval);

    const inferenceResult = await this.gpt.infer(
      prompt,
      nEval,
      options,
      onDecodeProgress,
      onInferenceProgress,
      inferenceAbortSignal,
    );

    console.log("Inference result", inferenceResult);

    let parsedCommands: StateCommand[];
    try {
      parsedCommands = await Director._parsePrediction(inferenceResult.result);
      return { inferenceResult, parsedCommands };
    } catch (e: any) {
      if (e instanceof CommandParseError) {
        return { inferenceResult, parseError: e };
      } else {
        throw e;
      }
    }
  }

  /**
   * Build a static prompt for the director agent.
   *
   * ```prompt
   * <|system|>
   * System prompt<|end|>
   * <|user|>\n
   * ```
   */
  private static _buildStaticPrompt(scenario: Scenario): string {
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
          {
            name: scene.name,
            description: scene.prompt, // I'm not sure about this.
            //                         // Maybe scene.directorPrompt?
          },
        ]),
      ),
      characters: Object.fromEntries(
        Object.entries(scenario.characters).map(([characterId, character]) => [
          characterId,
          {
            fullName: character.fullName,
            appearance: character.appearancePrompt,
            outfits: Object.fromEntries(
              Object.entries(character.outfits).map(([outfitId, outfit]) => [
                outfitId,
                {
                  prompt: outfit.prompt, // Also not sure about this.
                  //                     // Name could be enough?
                },
              ]),
            ),
            expressions: Object.keys(character.expressions),
          },
        ]),
      ),
      mainCharacter: scenario.defaultCharacterId,
    };

    type FunctionPrototype = {
      arguments: Record<string, string>;
      description: string;
      examples: { lines: string[]; note?: string }[];
    };

    const addCharacter: FunctionPrototype = {
      arguments: {
        characterId: "string",
        outfitId: "string",
        expressionId: "string",
      },
      description:
        "Add a new character to the stage with `characterId`, `outfitId`, and `expressionId`. The IDs MUST be present in [Setup]; if a contrived entity is not found in [Setup], use the NEAREST matching ID. The added character MUST NOT be currently present on the stage. DO NOT add a character if it is not expected to be present on the stage.",
      examples: [
        {
          lines: [
            "<alice> I'm here!",
            stateCommandToLine({
              name: "addCharacter",
              args: {
                characterId: "alice",
                outfitId: "dress",
                expressionId: "neutral",
              },
            }),
          ],
        },
      ],
    };

    const removeCharacter: FunctionPrototype = {
      arguments: {
        characterId: "string",
      },
      description:
        "Remove a character with `characterId` from the stage. The character MUST be currently present at the stage in order to be removed.",
      examples: [
        {
          lines: [
            "<alice> I'm leaving!",
            stateCommandToLine({
              name: "removeCharacter",
              args: { characterId: "alice" },
            }),
          ],
        },
      ],
    };

    const setExpression: FunctionPrototype = {
      arguments: {
        characterId: "string",
        expressionId: "string",
      },
      description:
        "Set expression of a character with `characterId` to `expressionId` (MUST be present in [Setup]). If the concieved expression is not found in [Setup], set it to the NEAREST matching expression ID from [Setup]. The character MUST be currently present at the stage. Do not set the expression if it did not change.",
      examples: [
        {
          lines: [
            "<alice> I'm happy!",
            stateCommandToLine({
              name: "setExpression",
              args: { characterId: "alice", expressionId: "smile" },
            }),
          ],
          note: `<alice> doesn't have a "happy" expression defined in [Setup], so the nearest matching "smile" expression is used instead.`,
        },
      ],
    };

    const setOutfit: FunctionPrototype = {
      arguments: {
        characterId: "string",
        outfitId: "string",
      },
      description:
        "Set outfit of the character with `characterId` to `outfitId` (MUST be present in [Setup]). If the concieved outfit is not found in [Setup], set it to the NEAREST matching outfit ID from [Setup]. The character MUST be currently present at the stage. Do not set the outfit if it did not change.",
      examples: [
        {
          lines: [
            "<alice> I'm wearing a cute school uniform! *I show it to everyone.*",
            stateCommandToLine({
              name: "setOutfit",
              args: { characterId: "alice", outfitId: "schoolUniform" },
            }),
          ],
          note: `<alice> does have an exact "schoolUniform" outfit defined in [Setup].`,
        },
        {
          lines: [
            "<alice> I'm wearing a new red dress! *I show it to everyone.*",
            stateCommandToLine({
              name: "setOutfit",
              args: { characterId: "alice", outfitId: "blueDress" },
            }),
          ],
          note: `<alice> doesn't have a red dress outfit defined in [Setup], so the nearest matching "blueDress" is used instead.`,
        },
      ],
    };

    const setScene: FunctionPrototype = {
      arguments: {
        sceneId: "string",
      },
      description:
        "Set scene to `sceneId` (MUST be present in [Setup]). If the concieved scene is not found in [Setup].scenes, set it to the NEAREST matching scene from [Setup].",
      examples: [
        {
          lines: [
            "<bob> Let's check the other room together!",
            stateCommandToLine({
              name: "setScene",
              args: { sceneId: "room2" },
            }),
          ],
          note: "The scenery changes to room2, but the characters remain, as if they walked to the other room all together.",
        },
        {
          lines: [
            "<bob> I'm going to check the other room alone.",
            "<alice> Okay, we'll stay here.",
            stateCommandToLine({
              name: "setScene",
              args: { sceneId: "room2" },
            }),
            stateCommandToLine({
              name: "removeCharacter",
              args: { characterId: "alice" },
            }),
            stateCommandToLine({
              name: "removeCharacter",
              args: { characterId: "carl" },
            }),
          ],
          note: "An abrupt scene change to room2, with <bob> remaining and other characters leaving the stage.",
        },
      ],
    };

    const functions = {
      setScene,
      addCharacter,
      removeCharacter,
      setCharacterOutfit: setOutfit,
      setCharacterExpression: setExpression,
    };

    return `<|system|>
You are a capable AI agent responsible for generating Lua engine code in accordance to an immersive simulation transcription. When a user sends you a piece of transcription, respond with ZERO OR MORE engine function calls representing simulation state change for the latest message in accordance to the [Setup] and [Functions] sections. Maintain the simulation context beginning from the [Root state] and only respond with the NECESSARY function calls to update the simulation state. If the state is already up-to-date, respond with an empty string. If some function calls are missing from the previous transcription but are deemed necessary, add them to the response (i.e. state healing). Do NOT repeat the same function calls in the response.

Transcription messages are character lines followed by zero or more according engine function calls. A character line is always a single line. For example:
${stateCommandToLine({ name: "setScene", args: { sceneId: "home" } })}
${stateCommandToLine({
  name: "addCharacter",
  args: { characterId: "alice", outfitId: "dress", expressionId: "neutral" },
})}
<alice> Hello, world!
<alice> What such a beautiful day!
${stateCommandToLine({
  name: "setExpression",
  args: { characterId: "alice", expressionId: "smile" },
})}
<bob> A beautiful day indeed! *I enter the room.*
${stateCommandToLine({
  name: "addCharacter",
  args: { characterId: "bob", outfitId: "suit", expressionId: "calm" },
})}
<alice> Hello, Bob! *I wave my hand.*
<bob> Hello, Alice!
${stateCommandToLine({
  name: "setExpression",
  args: { characterId: "bob", expressionId: "smile" },
})}

[Setup]
${JSON.stringify(setup)}

[Functions]
${JSON.stringify(functions)}
<|end|>
<|user|>
`;
  }

  /**
   * Does not include neither the `<|user|>` nor `<|end|>` tags.
   *
   * ```prompt
   * <alice> Hello, world!
   * {"name":"setScene","args":{"sceneId":"home"}}
   * {"name":"addCharacter","args":{"characterId":"alice","outfitId":"dress","expressionId":"neutral"}}
   * <bob> A beautiful day indeed! *I enter the room.*
   * ```
   */
  private static _buildDynamicPrompt(
    rootState: StateDto,
    updates: Update[],
  ): string {
    const rootCommands: StateCommand[] = [];

    rootCommands.push({
      name: "setScene",
      args: { sceneId: rootState.stage.sceneId },
    });

    for (const character of rootState.stage.characters) {
      rootCommands.push({
        name: "addCharacter",
        args: {
          characterId: character.id,
          outfitId: character.outfitId,
          expressionId: character.expressionId,
        },
      });
    }

    let text = rootCommands.map(stateCommandToLine).join("\n") + "\n";

    text += updates
      .map((update) => {
        const writerUpdate = update.ensureChosenVariant.writerUpdate;
        let text = `<${writerUpdate.characterId || "narrator"}> ${writerUpdate.text}`;

        if (update.ensureChosenVariant.directorUpdate) {
          text +=
            "\n" +
            update.ensureChosenVariant.directorUpdate.code
              .map(stateCommandToLine)
              .join("\n");
        }

        return text;
      })
      .join("\n");

    return text;
  }

  /**
   * Build a GNBF grammar to constrain director output.
   * @see https://github.com/ggerganov/llama.cpp/blob/master/grammars/README.md.
   */
  private static _buildGnbf(): string {
    /**
     * Prepare string for GNBF grammar.
     *
     * @example
     * prepareQuotes(`'{"name":"setScene","args":{"sceneId":' id '}}'`)
     * // => `"{\\"name\\":\\"setScene\\",\\"args\\":{\\"sceneId\\":" id "}}"`
     */
    function prepareString(input: string): string {
      return escapeQuotes(input).replace(/'/g, '"');
    }

    const auxRules: Record<string, string> = {
      id: `"\\"" [a-zA-Z_] [a-zA-Z0-9_-]* "\\""`,
    };

    const functionRules: string[] = [];

    // `setScene` command grammar.
    //
    // ```gnbf
    // set-scene ::= "{"
    //   "\"name\"" ":" "\"setScene\"" ","
    //   "\"args\"" ":" "{"
    //     "\"sceneId\"" ":" id
    //   "}"
    // "}"
    // ```
    auxRules["set-scene"] = prepareString(
      `'{"name":"setScene","args":{"sceneId":' id '}}'`,
    );
    functionRules.push("set-scene");

    // `addCharacter` grammar.
    //
    // ```gnbf
    // add-character ::= "{"
    //   "\"name\"" ":" "\"addCharacter\"" ","
    //   "\"args\"" ":" "{"
    //     "\"characterId\"" ":" id ","
    //     "\"outfitId\"" ":" id ","
    //     "\"expressionId\"" ":" id
    //   "}"
    // "}"
    // ```
    auxRules["add-character"] = prepareString(
      `'{"name":"addCharacter","args":{"characterId":' id ',"outfitId":' id ',"expressionId":' id '}}'`,
    );
    functionRules.push("add-character");

    // `removeCharacter` grammar.
    //
    // ```gnbf
    // remove-character ::= "{"
    //   "\"name\"" ":" "\"removeCharacter\"" ","
    //   "\"args\"" ":" "{"
    //     "\"characterId\"" ":" id
    //   "}"
    // "}"
    // ```
    auxRules["remove-character"] = prepareString(
      `'{"name":"removeCharacter","args":{"characterId":' id '}}'`,
    );
    functionRules.push("remove-character");

    // `setCharacterOutfit` grammar.
    //
    // ```gnbf
    // set-outfit ::= "{"
    //   "\"name\"" ":" "\"setOutfit\"" ","
    //   "\"args\"" ":" "{"
    //     "\"characterId\"" ":" id ","
    //     "\"outfitId\"" ":" id
    //   "}"
    // "}"
    // ```
    auxRules["set-outfit"] = prepareString(
      `'{"name":"setOutfit","args":{"characterId":' id ',"outfitId":' id '}}'`,
    );
    functionRules.push("set-outfit");

    // `setCharacterExpression` grammar.
    //
    // ```gnbf
    // set-expression ::= "{"
    //   "\"name\"" ":" "\"setExpression\"" ","
    //   "\"args\"" ":" "{"
    //     "\"characterId\"" ":" id ","
    //     "\"expressionId\"" ":" id
    //   "}"
    // "}"
    // ```
    auxRules["set-expression"] = prepareString(
      `'{"name":"setExpression","args":{"characterId":' id ',"expressionId":' id '}}'`,
    );
    functionRules.push("set-expression");

    return `
root ::= (function-call "\\n"){0,5}
function-call ::= ${functionRules.join(" | ")}
${Object.entries(auxRules)
  .map(([name, rule]) => `${name} ::= ${rule}`)
  .join("\n")}
`.trim();
  }

  /**
   * Parse the prediction into a list of state commands.
   * @throws {CommandParseError} If the prediction is not a valid state command.
   */
  private static async _parsePrediction(
    prediction: string,
  ): Promise<StateCommand[]> {
    const lines = prediction.split("\n").map((line) => line.trim());
    const commands: StateCommand[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines.at(i);
      if (!line) continue;

      console.log(`Parsing director line ${i + 1}¹`, line);

      const jsonParseResult =
        safeParseJson<v.InferInput<typeof StateCommandSchema>>(line);
      if (!jsonParseResult.success) {
        throw new CommandParseError(
          `Failed to parse prediction as JSON at line ${i + 1}¹: ${jsonParseResult.error}`,
        );
      }

      const commandParseResult = v.safeParse(
        StateCommandSchema,
        jsonParseResult.output,
      );

      if (!commandParseResult.success) {
        throw new CommandParseError(
          `Failed to parse prediction as state command at line ${i + 1}¹: ${formatIssues(commandParseResult.issues)}`,
        );
      }

      commands.push(commandParseResult.output);
    }

    return commands;
  }

  private constructor(
    private scenario: Scenario,
    readonly gpt: Gpt,
  ) {}
}

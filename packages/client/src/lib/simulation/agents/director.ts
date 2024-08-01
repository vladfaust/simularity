import { InferenceOptions } from "@/lib/simularity/common";
import { Gpt, GptDriver, StoredGptSession } from "@/lib/simularity/gpt";
import { Ref, computed } from "vue";
import { Scenario } from "../scenario";
import { State, StateDto } from "../state";
import {
  StateCommand,
  stateCommandToCodeLine,
  stateCommandsToCodeLines,
} from "../state/commands";
import { Update } from "../update";

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
    actualState: StateDto,
    recentUpdates: Update[],
    nEval: number,
    inferenceOptions?: InferenceOptions,
    onDecodeProgress?: (event: { progress: number }) => void,
    onInferenceProgress?: (event: { content: string }) => void,
    inferenceAbortSignal?: AbortSignal,
  ): Promise<StateCommand[]> {
    const staticPrompt = Director._buildStaticPrompt(this.scenario);
    const dynamicPrompt = Director._buildDynamicPrompt(
      rootState,
      recentUpdates,
    );

    const prompt = `${staticPrompt}${dynamicPrompt}<|end|>\n<|assistant|>\n`;

    const options: InferenceOptions = {
      grammar: Director._buildGnbf(this.scenario, actualState),
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

    return Director._parsePrediction(inferenceResult.result);
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
      mainCharacter: scenario.playerCharacterId,
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
        "Add a new character to the stage with `characterId`, `outfitId`, and `expressionId`. The IDs MUST be present in [Setup]; if a contrived entity is not found in [Setup], use the NEAREST matching ID from [Setup]. The added character MUST NOT be currently present at the stage. DO NOT add a character if it is not expected to be present.",
      examples: [
        {
          lines: [
            "<alice> I'm here!",
            'addCharacter{characterId:"alice",outfitId:"dress",expressionId:"neutral"}',
          ],
        },
      ],
    };

    const removeCharacter: FunctionPrototype = {
      arguments: {
        characterId: "string",
      },
      description:
        "Remove a character with `characterId` from the stage. The character MUST be present at the stage in order to be removed.",
      examples: [
        {
          lines: [
            "<alice> I'm leaving!",
            'removeCharacter{characterId:"alice"}',
          ],
        },
      ],
    };

    const setCharacterExpression: FunctionPrototype = {
      arguments: {
        characterId: "string",
        expressionId: "string",
      },
      description:
        "Set expression of a character with `characterId` to `expressionId` (MUST be present in [Setup]). If the concieved expression is not found in [Setup], set it to the NEAREST matching expression from [Setup]. The character MUST be currently present at the stage. Do not set the expression if it did not change.",
      examples: [
        {
          lines: [
            "<alice> I'm happy!",
            'setCharacterExpression{characterId:"alice",expressionId:"smile"}',
          ],
          note: `<alice> doesn't have a happy expression defined in [Setup], so the nearest matching "smile" expression is used instead.`,
        },
      ],
    };

    const setCharacterOutfit: FunctionPrototype = {
      arguments: {
        characterId: "string",
        outfitId: "string",
      },
      description:
        "Set outfit of the character with `characterId` to `outfitId` (MUST be present in [Setup]). If the concieved outfit is not found in [Setup], set it to the NEAREST matching outfit from [Setup]. The character MUST be currently present at the stage. Do not set the outfit if it did not change.",
      examples: [
        {
          lines: [
            "<alice> I'm wearing a cute school uniform! *I show it to everyone.*",
            'setCharacterOutfit{characterId:"alice",outfitId:"schoolUniform"}',
          ],
          note: `<alice> does have an exact "schoolUniform" outfit defined in [Setup].`,
        },
        {
          lines: [
            "<alice> I'm wearing a new red dress! *I show it to everyone.*",
            'setCharacterOutfit{characterId:"alice",outfitId:"blueDress"}',
          ],
          note: `<alice> doesn't have a red dress outfit defined in [Setup], so the nearest matching "blueDress" is used instead.`,
        },
      ],
    };

    const setScene: FunctionPrototype = {
      arguments: {
        sceneId: "string",
        clearScene: "boolean",
      },
      description:
        "Set scene to `sceneId` (MUST be present in [Setup]). If the concieved scene is not found in [Setup].scenes, set it to the NEAREST matching scene from [Setup]. If `clearScene` is `true`, would remove all characters from the stage (i.e. sharp transition). Otherwise, would keep the characters at the stage and update the scene background only (i.e. graceful scenery change). DO NOT change the scene if it did not change.",
      examples: [
        {
          lines: [
            "<bob> Let's check the other room together!",
            'setScene{sceneId:"room2",clearScene:false}',
          ],
          note: "The scenery changes to room2, but the characters remain, as if they walked to the other room.",
        },
        {
          lines: [
            "<bob> I'm going to check the other room alone.",
            "<alice> Okay, we'll stay here.",
            'setScene{sceneId:"room2",clearScene:true}',
            'addCharacter{characterId:"bob",outfitId:"tshirt",expressionId:"sad"}',
          ],
          note: "An abrupt scene change to room2, with <bob> (main character in this example) being added to the stage again.",
        },
      ],
    };

    const functions = {
      setScene,
      addCharacter,
      removeCharacter,
      setCharacterOutfit,
      setCharacterExpression,
    };

    return `<|system|>
You are a capable AI agent responsible for generating Lua engine code in accordance to an immersive simulation transcription. When a user sends you a piece of transcription, respond with ZERO OR MORE engine function calls representing simulation state change for the latest message in accordance to the [Setup] and [Functions] sections. Maintain the simulation context beginning from the [Root state] and only respond with the NECESSARY function calls to update the simulation state. If the state is already up-to-date, respond with an empty string. If some function calls are missing from the previous transcription but are deemed necessary, add them to the response (i.e. state healing). Do NOT repeat the same function calls in the response.

Transcription messages are character lines followed by zero or more according engine function calls. A character line is always a single line. For example, given empty root state and Alice as the main character, the following transcription:
<alice> Hello, world!
setScene{sceneId:"home",clearScene:true}
addCharacter{characterId:"alice",outfitId:"dress",expressionId:"neutral"}
<alice> It's such a beautiful day!
setCharacterExpression{characterId:"alice",expressionId:"smile"}
setMusic{musicId:"sunnyDay"}
<bob> A beautiful day indeed! *I enter the room.*
addCharacter{characterId:"bob",outfitId:"suit",expressionId:"calm"}
<alice> Hello, Bob! *I wave my hand.*
<bob> Hello, Alice!
setCharacterExpression{characterId:"bob",expressionId:"smile"}

The story evolves around the "mainCharacter" defined in [Setup]. The main character MUST always be present at the stage.

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
   * setScene{sceneId:"home",clearScene:true}
   * <bob> A beautiful day indeed! *I enter the room.*
   * ```
   */
  private static _buildDynamicPrompt(
    rootState: StateDto,
    updates: Update[],
  ): string {
    let text = "";

    if (rootState.stage.sceneId) {
      text +=
        stateCommandToCodeLine({
          name: "setScene",
          args: {
            sceneId: rootState.stage.sceneId,
            clearStage: true,
          },
        }) + "\n";
    }

    for (const character of rootState.stage.characters) {
      text +=
        stateCommandToCodeLine({
          name: "addCharacter",
          args: {
            characterId: character.id,
            outfitId: character.outfitId,
            expressionId: character.expressionId,
          },
        }) + "\n";
    }

    text += updates
      .map((update) => {
        const writerUpdate = update.ensureChosenVariant.writerUpdate;
        let text = `<${writerUpdate.characterId || "narrator"}> ${writerUpdate.text}`;

        if (update.ensureChosenVariant.directorUpdate) {
          text +=
            "\n" +
            stateCommandsToCodeLines(
              update.ensureChosenVariant.directorUpdate.code,
            ).join("\n");
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
  // TODO: Pass some context to further restrict arguments, e.g.
  // only can add a character if it's not already in the scene.
  private static _buildGnbf(scenario: Scenario, actualState: StateDto): string {
    const auxRules: Record<string, string> = {};
    const functionRules: string[] = [];

    // `setScene` grammar.
    //
    // ```gnbf
    // set-scene ::= "setScene{sceneId:"
    //   ("\"a\"" | "\"b\"") ",clearScene:" ("true" | "false") "}"
    // ```
    const allowedSceneIds = Object.keys(scenario.scenes).filter(
      (sceneId) => sceneId !== actualState.stage.sceneId,
    );
    if (allowedSceneIds.length) {
      auxRules["set-scene"] = `"setScene{sceneId:" (${allowedSceneIds
        .map((sceneId) => `"\\"${sceneId}\\""`)
        .join(" | ")}) ",clearScene:" ("true" | "false") "}"`;

      functionRules.push("set-scene");
    }

    // `addCharacter` grammar.
    //
    // ```gnbf
    // add-character-1 ::= "addCharacter{characterId:\"alice\",outfitId:"
    //   ("\"dress\"" | "\"sport\"") ",expressionId:"
    //   ("\"neutral\"" | "\"happy\"") "}"
    // add-character ::= add-character-1 | add-character-2
    // ```
    const absentCharacterIds = Object.keys(scenario.characters).filter(
      (characterId) =>
        !actualState.stage.characters.some(
          (character) => character.id === characterId,
        ),
    );

    let i = 0;
    if (absentCharacterIds.length) {
      for (const [characterId, character] of Object.entries(
        scenario.characters,
      ).filter(([characterId]) => absentCharacterIds.includes(characterId))) {
        auxRules[`add-character-${++i}`] =
          `"addCharacter{characterId:\\"${characterId}\\",outfitId:" (${Object.keys(
            character.outfits,
          )
            .map((outfitId) => `"\\"${outfitId}\\""`)
            .join(" | ")}) ",expressionId:" (${Object.keys(
            character.expressions,
          )
            .map((expressionId) => `"\\"${expressionId}\\""`)
            .join(" | ")}) "}"`;
      }

      auxRules["add-character"] = absentCharacterIds
        .map((_, i) => `add-character-${i + 1}`)
        .join(" | ");

      functionRules.push("add-character");
    }

    // `removeCharacter` grammar.
    //
    // ```gnbf
    // remove-character ::= "removeCharacter{characterId:"
    //   ("\"alice\"" | "\"bob\"") "}"
    // ```
    const characterIdsPresentOnStage = actualState.stage.characters.map(
      (character) => character.id,
    );

    if (characterIdsPresentOnStage.length) {
      auxRules["remove-character"] =
        `"removeCharacter{characterId:" (${characterIdsPresentOnStage
          .map((characterId) => `"\\"${characterId}\\""`)
          .join(" | ")}) "}"`;

      functionRules.push("remove-character");
    }

    // `setCharacterOutfit` grammar.
    //
    // ```gnbf
    // set-outfit-1 ::= "setCharacterOutfit{characterId:\"alice\",outfitId:"
    //   ("\"dress\"" | "\"suit\"") "}"
    // set-outfit ::= set-outfit-1 | set-outfit-2
    // ```

    if (characterIdsPresentOnStage.length) {
      i = 0;

      for (const [characterId, character] of Object.entries(
        scenario.characters,
      ).filter(([characterId]) =>
        characterIdsPresentOnStage.includes(characterId),
      )) {
        auxRules[`set-outfit-${++i}`] =
          `"setCharacterOutfit{characterId:\\"${characterId}\\",outfitId:" (${Object.keys(
            character.outfits,
          )
            .map((outfitId) => `"\\"${outfitId}\\""`)
            .join(" | ")}) "}"`;
      }

      auxRules["set-outfit"] = characterIdsPresentOnStage
        .map((_, i) => `set-outfit-${i + 1}`)
        .join(" | ");

      functionRules.push("set-outfit");
    }

    // `setCharacterExpression` grammar.
    //
    // ```gnbf
    // set-expression-1 ::= "setCharacterExpression{characterId:\"alice\",expressionId:"
    //   ("\"neutral\"" | "\"happy\"") "}"
    // set-expression ::= set-expression-1 | set-expression-2
    // ```
    if (characterIdsPresentOnStage.length) {
      i = 0;

      for (const [characterId, character] of Object.entries(
        scenario.characters,
      ).filter(([characterId]) =>
        characterIdsPresentOnStage.includes(characterId),
      )) {
        auxRules[`set-expression-${++i}`] =
          `"setCharacterExpression{characterId:\\"${characterId}\\",expressionId:" (${Object.keys(
            character.expressions,
          )
            .map((expressionId) => `"\\"${expressionId}\\""`)
            .join(" | ")}) "}"`;
      }

      auxRules["set-expression"] = characterIdsPresentOnStage
        .map((_, i) => `set-expression-${i + 1}`)
        .join(" | ");

      functionRules.push("set-expression");
    }

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
   * @throws {EngineCodeSemanticError} If the prediction is not a valid state command.
   */
  private static async _parsePrediction(
    prediction: string,
  ): Promise<StateCommand[]> {
    const lines = prediction.split("\n").map((line) => line.trim());
    const commands: StateCommand[] = [];

    const luaEngine = await State.createLuaEngine({
      setScene: (sceneId: string, clearScene: boolean) => {
        commands.push({
          name: "setScene",
          args: { sceneId, clearStage: clearScene },
        });
      },
      addCharacter: (
        characterId: string,
        outfitId: string,
        expressionId: string,
      ) => {
        commands.push({
          name: "addCharacter",
          args: { characterId, outfitId, expressionId },
        });
      },
      removeCharacter: (characterId: string) => {
        commands.push({ name: "removeCharacter", args: { characterId } });
      },
      setCharacterOutfit: (characterId: string, outfitId: string) => {
        commands.push({
          name: "setCharacterOutfit",
          args: { characterId, outfitId },
        });
      },
      setCharacterExpression: (characterId: string, expressionId: string) => {
        commands.push({
          name: "setCharacterExpression",
          args: { characterId, expressionId },
        });
      },
    });

    for (const line of lines) {
      console.log("Evaluating line", line);
      await luaEngine.doString(line);
    }

    return commands;
  }

  private constructor(
    private scenario: Scenario,
    readonly gpt: Gpt,
  ) {}
}

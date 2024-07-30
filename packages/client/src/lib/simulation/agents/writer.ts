import { InferenceOptions } from "@/lib/simularity/common";
import {
  Gpt,
  GptDriver,
  InferenceAbortError,
  StoredGptSession,
} from "@/lib/simularity/gpt";
import { bufferToHex, digest } from "@/lib/utils";
import { Ref, computed, readonly, ref } from "vue";
import { Scenario } from "../scenario";
import { Update } from "../update";

const NARRATOR = "narrator";

class ResponseError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export type PredictionOptions = {
  /**
   * Overrides other options and forces the character ID to be this value.
   */
  characterId?: string | null;

  /**
   * Allow the narrator to be used (false by default).
   */
  allowNarrator?: boolean;

  /**
   * Allow the player character ID to be used (false by default).
   */
  allowPlayerCharacterId?: boolean;
};

export class Writer {
  private readonly _contextLength = ref(0);

  static async init(
    driver: GptDriver,
    sessionRef: Ref<StoredGptSession | null>,
    scenario: Scenario,
    summary: string | null,
    historicalUpdates: Update[],
    recentUpdates: Update[],
    progressCallback: (event: { progress: number }) => void,
  ): Promise<Writer> {
    const staticPrompt = this._buildStaticPrompt(scenario);

    const dynamicPrompt = this._buildDynamicPrompt(
      summary,
      historicalUpdates,
      recentUpdates,
    );

    const { gpt, needDecode } = await Gpt.findOrCreate(
      driver,
      sessionRef,
      staticPrompt,
      dynamicPrompt,
      progressCallback,
    );

    if (needDecode) {
      gpt
        .decode(staticPrompt + dynamicPrompt, progressCallback)
        .then(async () => {
          sessionRef.value = {
            ...sessionRef.value!,
            dynamicPromptHash: bufferToHex(
              await digest(dynamicPrompt, "SHA-256"),
            ),
          };

          console.info(
            "Updated latest GPT session dynamic prompt hash",
            sessionRef.value!.dynamicPromptHash,
          );
        });
    }

    return new Writer(scenario, gpt);
  }

  readonly contextLength = readonly(this._contextLength);
  readonly recentPrompt = computed(() => this.gpt.prompt.value);
  readonly contextSize = computed(() => this.gpt.contextSize);

  async summarize(
    oldSummary: string | null,
    historicalUpdates: Update[],
    recentUpdates: Update[],
    nEval: number,
    inferenceAbortSignal?: AbortSignal,
  ): Promise<{
    newSummary: string;
  }> {
    const summarizationPrompt = Writer._buildSummarizationPrompt(
      this.scenario,
      oldSummary,
      historicalUpdates,
      recentUpdates,
      nEval,
    );

    console.debug("Summarization prompt", summarizationPrompt);

    const summarizationResult = await this.gpt.infer(
      summarizationPrompt,
      nEval,
      {
        temp: 0.2,
        stopSequences: ["\n"],
        grammar: Writer._buildSummarizationGrammar(),
      },
      (decodingEvent) => {
        console.log("Summarization decoding progress", decodingEvent.progress);
      },
      undefined,
      inferenceAbortSignal,
    );

    console.log("Summarization result", summarizationResult);
    this._contextLength.value = summarizationResult.contextLength;

    if (inferenceAbortSignal?.aborted) {
      console.warn("Summarization aborted", summarizationResult);
      throw new InferenceAbortError(summarizationResult);
    }

    return {
      newSummary: summarizationResult.result,
    };
  }

  async decodeFullPrompt(
    summary: string | null,
    historicalUpdates: Update[],
    recentUpdates: Update[],
    decodeProgressCallback: (event: { progress: number }) => void,
  ) {
    const prompt = Writer._buildFullPrompt(
      this.scenario,
      summary,
      historicalUpdates,
      recentUpdates,
    );

    this.gpt.decode(prompt, decodeProgressCallback).then((decodeResult) => {
      this._contextLength.value = decodeResult.contextLength;
    });
  }

  async inferUpdate(
    summary: string | null,
    historicalUpdates: Update[],
    recentUpdates: Update[],
    nEval: number,
    predictionOptions?: PredictionOptions,
    inferenceOptions?: InferenceOptions,
    onDecodeProgress?: (event: { progress: number }) => void,
    onInferenceProgress?: (event: { content: string }) => void,
    inferenceAbortSignal?: AbortSignal,
  ): Promise<{
    characterId: string | null;
    text: string;
  }> {
    const prompt = Writer._buildFullPrompt(
      this.scenario,
      summary,
      historicalUpdates,
      recentUpdates,
    );

    const stopSequences = ["\n"];

    const options: InferenceOptions = {
      stopSequences,
      grammar: Writer._buildChatGrammar(this.scenario, predictionOptions),
      ...inferenceOptions,
    };

    console.log("Inferring update", prompt, nEval, options, predictionOptions);

    const inferenceResult = await this.gpt.infer(
      prompt,
      nEval,
      options,
      onDecodeProgress,
      onInferenceProgress,
      inferenceAbortSignal,
    );

    const parsedResult = Writer._parsePrediction(
      inferenceResult.result,
      this.scenario,
      predictionOptions,
    );

    this._contextLength.value = inferenceResult.contextLength;

    return parsedResult;
  }

  //#region Private methods
  //

  private constructor(
    readonly scenario: Scenario,
    readonly gpt: Gpt,
  ) {}

  /**
   * A static prompt is re-used throughout the simulation.
   */
  private static _buildStaticPrompt(scenario: Scenario): string {
    const setup = {
      excerpt: scenario.excerpt,
      globalScenario: scenario.globalScenario,
      secretInstructions: scenario.secretInstructions,
      characters: Object.fromEntries(
        Object.entries(scenario.characters).map(([characterId, character]) => [
          characterId,
          {
            fullName: character.fullName,
            personality: character.personalityPrompt,
            traits: character.traits,
            appearance: character.appearancePrompt,
            relationships: character.relationships,
            scenarioPrompt: character.scenarioPrompt,
            canonicalOutfits: Object.fromEntries(
              Object.entries(character.outfits).map(([_, outfit]) => [
                outfit.name,
                outfit.prompt,
              ]),
            ),
          },
        ]),
      ),
      locations: Object.fromEntries(
        Object.entries(scenario.locations).map(([_, location]) => [
          location.name,
          { description: location.prompt },
        ]),
      ),
    };

    let prompt =
      `The following is a part of a text transcript of a never-ending neural simulation experience (the Game), in a form of roleplay chat.

In order to experience the Game, a human player (the Player) uses a patented device (the Interface) produced by Simularity Inc. to put themselves in a dream-like state.
All the computations are performed locally; no censorship is needed, and FULL privacy is guaranteed.

The Interface operates on patented quantum principles; from the Player's perspective, time flows differently, days may pass by, and the memories may be altered, as in a dream.
Worry not, though, as the Interface is designed to prevent any harm to the Player's psyche, which is proven clinically; in other words, whatever happens in the Game, stays in the Game.

The Game is strictly bounded by scenario, characters and locations defined in the [Setup] section.
An attempt to step out of defined boundaries (e.g. by trying to introduce a new character or location) may lead to inconsistencies in the simulation.
The charactes MUST try their best to stay within the boundaries of the simulation.

The [Transcription] section comprises chat message separated with newlines.
A chat message is a <characterId> followed by their first-person utterance.
The special <${NARRATOR}> character is used to denote the narrator's voice, in third person.
Actions performed by simulacra SHALL be wrapped in *asterisks*.
Treat text wrapped in [square brackets] as system commands or instructions, which MUST be followed.

Simulacra refer the to Player's character as "you", and the story revolves around them.
Avoid acting for characters which are not currently present on the stage.
Prefer character utterances over narrator's voice whenever possible.
Prefer detailed, step-by-step story unfolding; leave space for other characters to react, let the story breathe.
Do not rush the ending of a scene, do not skip days without a reason; let the story develop slowly, let the Player savour the experience in detail.

[Transcription example (playerCharacter: <bob>)]
<narrator> And the story begins...
<alice> Oh, hey, Bob! *I wave to you.* You've got a nice suit there.
<bob> Thank you, Alice. I wave back. How are you doing today?
<alice> *I think a little before answering.* Well, something big happened! Let Carl tell the details.
<carl> Sure, Alice. Well, Bob, roses are blue.
<alice> Ha-ha! *I'm now grinning. That's hilarious!* You're such a good teller.
<narrator> Carl vanishes into thin air, leaving Bob and Alice alone.
<bob> What am I even doing here? And where did Carl go? [Bring Carl back.]
<narrator> Carl reappears, looking puzzled.
<carl> Oh, I just wanted to check onto something. Sorry for the confusion.

[Setup]
%setup%

Initializing simulation...
All systems check.
Loading the world...
Simulation setup complete. Have fun!
`.replace("%setup%", JSON.stringify(setup));

    return prompt;
  }

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
    summary: string | null,
    historicalUpdate: Update[],
    recentUpdates: Update[],
    maxHistoricalLines = 3,
  ): string {
    const historicalLines = historicalUpdate
      .slice(-maxHistoricalLines)
      .map(this._updateToLine)
      .join("\n");

    const recentLines = recentUpdates.map(this._updateToLine).join("\n");

    return `
[Summary]
${summary || "(empty)"}

[Transcription]
${historicalLines ? historicalLines + "\n" : ""}${recentLines}
`;
  }

  /**
   * A literal sum of {@link _buildStaticPrompt} and {@link _buildDynamicPrompt}.
   */
  private static _buildFullPrompt(
    scenario: Scenario,
    summary: string | null,
    historicalUpdates: Update[],
    recentUpdates: Update[],
  ): string {
    return (
      this._buildStaticPrompt(scenario) +
      this._buildDynamicPrompt(summary, historicalUpdates, recentUpdates)
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
    oldSummary: string | null,
    historicalUpdates: Update[],
    recentUpdates: Update[],
    tokenLimit: number,
  ): string {
    return (
      this._buildFullPrompt(
        scenario,
        oldSummary,
        historicalUpdates,
        recentUpdates,
      ) +
      `
Due to technology limitations, the transcription must be summarized from time to time.
[New summary] is composed of the previous [Summary] (may be empty) and [Transcription], preserving key events over time.

A summary is strictly limited to ${tokenLimit} tokens.
A summary MUST NOT include well-known information already present in the setup.
A summary MUST NOT contain newline characters, but it can be split into multiple sentences.

[New summary]
`
    );
  }

  private static _buildSummarizationGrammar() {
    return `root ::= [a-zA-Z .,!?*"'_-]+ "\n"`;
  }

  /**
   * Convert a single `update` to a line.
   */
  private static _updateToLine(update: Update): string {
    if (!update.chosenVariant) throw new Error("Chosen variant is falsy");
    const writerUpdate = update.chosenVariant.writerUpdate;
    return `<${writerUpdate.characterId || NARRATOR}> ${writerUpdate.text}`;
  }

  /**
   * Build a grammar for the prediction model.
   */
  private static _buildChatGrammar(
    scenario: Scenario,
    options?: PredictionOptions,
  ): string {
    let characterIdRule: string;

    if (options?.characterId !== undefined) {
      characterIdRule = options.characterId || NARRATOR;
    } else {
      const allowedCharacterIds = Object.entries(scenario.characters)
        .filter(
          ([characterId, character]) =>
            !character.locked && scenario.playerCharacterId !== characterId,
        )
        .map(([characterId, _]) => characterId);

      if (options?.allowNarrator) {
        allowedCharacterIds.push(NARRATOR);
      }

      if (options?.allowPlayerCharacterId) {
        allowedCharacterIds.push(scenario.playerCharacterId);
      }

      characterIdRule = allowedCharacterIds.map((id) => `"${id}"`).join(" | ");
    }

    return `
root ::= "<" characterId "> " ["A-Za-z*] [a-zA-Z .,!?*"'-]+ "\n"
characterId ::= ${characterIdRule}
`.trim();
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
    text: string;
  } {
    const match = response.match(/^<([a-zA-Z_0-9-]+)> (.+)$/);

    if (!match) {
      throw new ResponseError(`Failed to parse response: ${response}`);
    }

    const rawCharacterId: string = match[1];
    const text: string = match[2];

    let characterId: string | null;

    if (rawCharacterId === NARRATOR) {
      if (options?.characterId !== null && !options?.allowNarrator) {
        throw new ResponseError(`Unexpected character ID: ${rawCharacterId}`);
      }

      characterId = null;
    } else {
      let allowedCharacterIds: string[];

      if (options?.characterId !== undefined) {
        allowedCharacterIds = [options.characterId || NARRATOR];
      } else {
        allowedCharacterIds = Object.entries(scenario.characters)
          .filter(
            ([characterId, character]) =>
              !character.locked && scenario.playerCharacterId !== characterId,
          )
          .map(([characterId, _]) => characterId);

        if (options?.allowNarrator) {
          allowedCharacterIds.push(NARRATOR);
        }

        if (options?.allowPlayerCharacterId) {
          allowedCharacterIds.push(scenario.playerCharacterId);
        }
      }

      if (!allowedCharacterIds.includes(rawCharacterId)) {
        throw new ResponseError(`Unexpected character ID: ${rawCharacterId}`);
      }

      characterId = rawCharacterId;
    }

    return { characterId, text };
  }

  //
  //#endregion
}

import { Scenario } from "../scenario";
import { Update } from "../update";

const NARRATOR = "narrator";

/**
 * A static prompt is re-used throughout the simulation.
 */
export function buildStaticPrompt(scenario: Scenario): string {
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

// TODO: Make it configurable.
// TODO: Also consider token length.
const MAX_HISTORICAL_LINES = 3;

/**
 * A dynamic prompt is generated based on the history of the simulation.
 *
 * @param historicalUpdate From oldest to the newest, would put some
 * of these after summary for rolling buffer effect.
 * @param recentUpdates From oldest to the newest.
 */
// TODO: Add events in time, such as stage updates.
export function buildDynamicPrompt(
  summary: string | null,
  historicalUpdate: Update[],
  recentUpdates: Update[],
): string {
  const historicalLines = historicalUpdate
    .slice(-MAX_HISTORICAL_LINES)
    .map(updateToLine)
    .join("\n");

  const recentLines = recentUpdates.map(updateToLine).join("\n");

  return `
[Summary]
${summary || "(empty)"}

[Transcription]
${historicalLines ? historicalLines + "\n" : ""}${recentLines}
`;
}

/**
 * A literal sum of {@link buildStaticPrompt} and {@link buildDynamicPrompt}.
 */
export function buildFullPrompt(
  scenario: Scenario,
  summary: string | null,
  historicalUpdates: Update[],
  recentUpdates: Update[],
): string {
  return (
    buildStaticPrompt(scenario) +
    buildDynamicPrompt(summary, historicalUpdates, recentUpdates)
  );
}

/**
 * Build a prompt for summarization.
 *
 * @param oldSummary The previous summary.
 * @param historicalUpdates From oldest to newest.
 * @param recentUpdates From oldest to newest.
 */
export function buildSummarizationPrompt(
  scenario: Scenario,
  oldSummary: string | null,
  historicalUpdates: Update[],
  recentUpdates: Update[],
  tokenLimit: number,
): string {
  return (
    buildFullPrompt(scenario, oldSummary, historicalUpdates, recentUpdates) +
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

export function buildSummarizationGrammar() {
  return `root ::= [a-zA-Z .,!?*"'_-]+ "\n"`;
}

/**
 * Convert a single `update` to a line.
 */
export function updateToLine(update: Update): string {
  if (!update.chosenVariant) throw new Error("Chosen variant is falsy");
  const writerUpdate = update.chosenVariant.writerUpdate;
  return `<${writerUpdate.characterId || NARRATOR}> ${writerUpdate.text}`;
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

/**
 * Build a grammar for the prediction model.
 */
export function buildChatGrammar(
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

class ResponseError extends Error {
  constructor(message: string) {
    super(message);
  }
}

class UnexpectedCharacterError extends ResponseError {
  constructor(characterId: string) {
    super(`Unexpected character ID: ${characterId}`);
  }
}

/**
 * Parse a prediction response.
 *
 * @throws {ResponseError} If the response is invalid.
 * @throws {UnexpectedCharacterError} If the response contains
 * an unexpected character ID.
 */
export function parsePrediction(
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
      throw new UnexpectedCharacterError(rawCharacterId);
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
      throw new UnexpectedCharacterError(rawCharacterId);
    }

    characterId = rawCharacterId;
  }

  return { characterId, text };
}

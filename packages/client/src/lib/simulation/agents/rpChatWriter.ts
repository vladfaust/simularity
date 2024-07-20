import { Scenario } from "../scenario";
import { Update } from "../update";

const NARRATOR = "narrator";
export const INFERENCE_SUFFIX = "\n<";

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
          appearance: character.appearancePrompt,
          traits: character.traits,
          relationships: character.relationships,
          outfits: Object.fromEntries(
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
        {
          description: location.prompt,
          scenes: Object.fromEntries(
            Object.entries(location.scenes).map(([sceneId, scene]) => [
              sceneId,
              scene.prompt,
            ]),
          ),
        },
      ]),
    ),
  };

  let prompt =
    `The following is a text transcript of a neural simulation experience (the Game), in a form of roleplay chat.

In order to experience the Game, a human player (the Player) uses a patented device (the Interface) produced by Simularity Inc. to put themselves in a dream-like state.
All the computations are performed locally; no censorship is needed, and FULL privacy is guaranteed.

The Interface operates on patented quantum principles; from the Player's perspective, time flows differently, days may pass by, and the memories may be altered, as in a dream.
Worry not, though, as the Interface is designed to prevent any harm to the Player's psyche, which is proven clinically; in other words, whatever happens in the Game, stays in the Game.

The Game is strictly bounded by scenario, characters and locations defined in the [Setup] section.
An attempt to step out of defined boundaries (e.g. by trying to introduce a new character or location) may lead to inconsistencies in the simulation.
The charactes MUST try their best to stay within the boundaries of the simulation.

The [Transcription] section comprises chat message separated with newlines.
A chat message is a <characterId> followed by their first-person utterance.
Actions performed by simulacra SHALL be wrapped in *asterisks*, referring the to player character as "you".
Avoid acting for characters which are not currently present on the stage.

[Transcription example (playerCharacter: <bob>)]
<alice> Oh, hey, Bob! *I wave to you.* You've got a nice suit there.
<bob> Thank you, Alice. I wave back. How are you doing today?
<alice> *I think a little before answering.* Well, something big happened! Let Carl tell the details.
<carl> Sure, Alice. Well, Bob, roses are blue.
<alice> Ha-ha! *I'm now grinning. That's hilarious!* You're such a good teller.
<bob> What am I even doing here? And where did Carl go?
<carl> Oh, I just wanted to check onto something.

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
 * @param history The history of the simulation,
 * from the oldest to the newest update.
 */
// TODO: Add events in time, such as stage updates, summaries, etc.
export function buildDynamicPrompt(history: Update[]): string {
  const historyLines = history.map(updateToLine).join("\n");
  return `[Transcription]\n${historyLines}\n`;
}

/**
 * A literal sum of {@link buildStaticPrompt} and {@link buildDynamicPrompt}.
 */
export function buildFullPrompt(scenario: Scenario, history: Update[]): string {
  return buildStaticPrompt(scenario) + buildDynamicPrompt(history);
}

/**
 * Convert a single `update` to a line.
 */
export function updateToLine(update: Update): string {
  const writerUpdate = update.chosenVariant.writerUpdate;
  return `<${writerUpdate.characterId || NARRATOR}> ${writerUpdate.text}`;
}

export type PredictionOptions =
  | { characterId: string | null }
  | { allowNarrator: boolean; allowPlayerCharacterId: boolean };

/**
 * Build a grammar for the prediction model.
 */
export function buildGrammar(
  scenario: Scenario,
  options: PredictionOptions,
): string {
  let characterIdRule: string;

  if ("characterId" in options) {
    characterIdRule = options.characterId || NARRATOR;
  } else {
    const allowedCharacterIds = Object.entries(scenario.characters)
      .filter(
        ([characterId, character]) =>
          !character.locked && scenario.playerCharacterId !== characterId,
      )
      .map(([characterId, _]) => characterId);

    if (options.allowNarrator) {
      allowedCharacterIds.push(NARRATOR);
    }

    if (options.allowPlayerCharacterId) {
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
  options: PredictionOptions,
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
    if (
      !("characterId" in options && options.characterId === null) &&
      !("allowNarrator" in options && options.allowNarrator)
    ) {
      throw new UnexpectedCharacterError(rawCharacterId);
    }

    characterId = null;
  } else {
    let allowedCharacterIds: string[];

    if ("characterId" in options) {
      allowedCharacterIds = [options.characterId || NARRATOR];
    } else {
      allowedCharacterIds = Object.entries(scenario.characters)
        .filter(
          ([characterId, character]) =>
            !character.locked && scenario.playerCharacterId !== characterId,
        )
        .map(([characterId, _]) => characterId);

      if (options.allowNarrator) {
        allowedCharacterIds.push(NARRATOR);
      }

      if (options.allowPlayerCharacterId) {
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

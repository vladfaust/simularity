import { StateDto } from "./state";
import { StateCommand } from "./state/commands";

// TODO: Make it a Valibot schema.
export type Scenario = {
  name: string;

  /**
   * *(Static)* What is the player is expecting from this scenario.
   */
  excerpt: string;

  /**
   * *(Static)* Global scenario prompt, always present.
   */
  globalScenario: string;

  /**
   * *(Static)* Secret instructions to drive the AI generation.
   */
  secretInstructions: string;

  playerCharacterId: string;
  startEpisodeId: string;
  defaultSceneId: string;

  characters: {
    /**
     * Restricted values: "system", "narrator".
     */
    [id: string]: {
      pfp: string;
      fullName: string;
      displayName?: string;
      displayColor: string;

      /**
       * *(UI)* Short string about the character.
       */
      about: string;

      locked?: boolean;
      personalityPrompt: string;
      traits?: string[];
      appearancePrompt?: string;
      scenarioPrompt?: string;
      relationships?: {
        [characterId: string]: string;
      };
      bodies: [string];
      expressions: {
        [id: string]: {
          bodyId: number;
          file: string;
        };
      };
      outfits: {
        [id: string]: {
          name: string;
          prompt: string;
          /** Outfit files, with index matching the body's. */
          files: [string];
        };
      };
    };
  };

  locations: {
    [id: string]: {
      /**
       * *(Prompt, UI)* Location name.
       */
      name: string;

      /**
       * *(UI)* Short string about the location.
       */
      about: string;

      /**
       * *(Prompt)* Description of the location, put into the static prompt.
       */
      prompt: string;

      /**
       * *(Prompt, UI)* Connections to other locations, for better navigation.
       */
      connections?: string[];
    };
  };

  scenes: {
    [id: string]: {
      /**
       * *(Prompt, UI)* Scene name.
       */
      name: string;

      /**
       * Background image.
       */
      bg: string;

      /**
       * *(Prompt)* Description of the scene, put into the static prompt.
       */
      prompt: string;
    };
  };

  episodes: {
    [id: string]: {
      checkpoint?: {
        summary: string;
        state: StateDto;
      };
      chunks: [
        {
          characterId: string;
          text: string;
          code?: StateCommand[];
        },
      ];
    };
  };
};

export function findLocation(
  scenario: Scenario,
  locationId: string,
): Scenario["locations"][string] | undefined {
  if (Object.keys(scenario.locations).includes(locationId)) {
    return scenario.locations[locationId];
  } else {
    return undefined;
  }
}

export function findScene(scenario: Scenario, sceneId: string) {
  if (Object.keys(scenario.scenes).includes(sceneId)) {
    return scenario.scenes[sceneId];
  } else {
    return undefined;
  }
}

/**
 * Find a scene by ID, or throw an error if not found.
 */
export function ensureScene(scenario: Scenario, sceneId: string) {
  const found = findScene(scenario, sceneId);
  if (!found) throw new Error(`Scene not found: ${sceneId}`);
  return found;
}

export function findCharacter(
  scenario: Scenario,
  characterId: string,
): Scenario["characters"][string] | undefined {
  if (Object.keys(scenario.characters).includes(characterId)) {
    return scenario.characters[characterId];
  } else {
    return undefined;
  }
}

/**
 * Find a character by ID, or throw an error if not found.
 */
export function ensureCharacter(
  scenario: Scenario,
  characterId: string,
): Scenario["characters"][string] {
  const found = findCharacter(scenario, characterId);
  if (!found) throw new Error(`Character not found: ${characterId}`);
  return found;
}

export function findOutfit(
  character: Scenario["characters"][string],
  outfitId: string,
) {
  if (Object.keys(character.outfits).includes(outfitId)) {
    return character.outfits[outfitId];
  } else {
    return undefined;
  }
}

export function findExpression(
  character: Scenario["characters"][string],
  expressionId: string,
) {
  if (Object.keys(character.expressions).includes(expressionId)) {
    return character.expressions[expressionId];
  } else {
    return undefined;
  }
}

export function findEpisode(
  scenario: Scenario,
  episodeId: string,
): Scenario["episodes"][string] | undefined {
  if (Object.keys(scenario.episodes).includes(episodeId)) {
    return scenario.episodes[episodeId];
  } else {
    return undefined;
  }
}

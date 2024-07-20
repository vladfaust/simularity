import { assert, unreachable } from "@/lib/utils";
import { XmlNode } from "@/lib/xmlNode";
import { Scenario } from "../scenario";
import { toSceneQualifiedId } from "../state";
import { Update } from "../update";

export type Message =
  | {
      role: "system";
      content: string;
    }
  | {
      role: "user";
      content: string;
    }
  | {
      role: "assistant";
      content: string;
    };

export const SYSTEM_PREFIX = "<|system|> ";
export const USER_PREFIX = "<|user|> ";
export const AI_PREFIX = "<|assistant|> ";

// TODO: Allow (some) emojis.
// @see https://stackoverflow.com/questions/30470079/emoji-value-range.
export const GRAMMAR = `root ::= ["A-Za-z*] [a-zA-Z .,!?*"'-]+ "\n"`;

export const RESPONSE_PREFIX = `### Response:\n${AI_PREFIX}`;

/**
 * A static prompt is re-used throughout the simulation.
 *
 * ```plaintext
 * Below is an instruction...
 *
 * ### Instructions
 * {chat instructions}
 * system: {global prompt}
 * system: {locations}
 * system: {characters}\n
 * ```
 */
export function buildStaticPrompt(scenario: Scenario): string {
  // NOTE: This is an Alpaca template.
  let prompt = `The following is never-ending roleplay chat between a user (${USER_PREFIX.trim()}) and the AI assistant (${AI_PREFIX.trim()}). As an AI assistant, you must follow the instructions below. Respond with a message to continue the conversation.\n\n### Instructions:\n${scenario.secretInstructions}\n`;

  // Global scenario prompt.
  prompt +=
    new XmlNode("GlobalPrompt", scenario.globalScenario).toString() + "\n";

  // Locations.
  for (const [locationId, location] of Object.entries(scenario.locations)) {
    prompt +=
      new XmlNode("Location", location.prompt)
        .addAttribute("id", locationId)
        .addAttribute("name", location.name)
        .addChildren(
          Object.entries(location.scenes).map(([sceneId, scene]) =>
            new XmlNode("Scene", scene.prompt).addAttribute(
              "id",
              toSceneQualifiedId(locationId, sceneId),
            ),
          ),
        )
        .addChildren(
          location.connections?.map((connection) =>
            new XmlNode("Connection").addAttribute("to", connection),
          ) ?? [],
        )
        .toString() + "\n";
  }

  // Characters.
  for (const [characterId, character] of Object.entries(
    scenario.characters,
  ).filter(([_, character]) => !character.locked)) {
    prompt +=
      new XmlNode("Character", character.scenarioPrompt)
        .addAttribute("id", characterId)
        .addAttribute("name", character.fullName)
        .addChild(
          new XmlNode("Personality", character.personalityPrompt).addChildren(
            character.traits?.map((trait) => new XmlNode("Trait", trait)) ?? [],
          ),
        )
        .addChild(new XmlNode("Appearance", character.appearancePrompt))
        .addChildren(
          Object.entries(character.outfits).map(([outfitId, outfit]) =>
            new XmlNode("Outfit", outfit.prompt)
              .addAttribute("id", outfitId)
              .addAttribute("name", outfit.name),
          ),
        )
        .addChildren(
          character.relationships
            ? Object.entries(character.relationships)
                .filter(
                  ([characterId]) =>
                    !assert(
                      Object.entries(scenario.characters).find(
                        ([lookupCharacterId, _]) =>
                          lookupCharacterId === characterId,
                      ),
                    )?.[1].locked,
                )
                .map(([characterId, relationship]) =>
                  new XmlNode("Relationship", relationship).addAttribute(
                    "with-character-id",
                    characterId,
                  ),
                )
            : [],
        )
        .toString() + "\n";
  }

  return prompt;
}

/**
 * A dynamic prompt is generated based on the history of the simulation.
 *
 * @param updates The history of the simulation,
 * from the oldest to the newest update.
 */
// TODO: Add events in time, such as stage updates, summaries, etc.
export function buildDynamicPrompt(updates: Update[]): string {
  const messages: Message[] = updates.map((update) => {
    const writerUpdate = update.chosenVariant.writerUpdate;

    return {
      role: writerUpdate.createdByPlayer ? "user" : "assistant",
      content: writerUpdate.text,
    };
  });

  return `${formatMessages(messages)}\n\n${RESPONSE_PREFIX}`;
}

/**
 * A literal sum of {@link buildStaticPrompt} and {@link buildDynamicPrompt}.
 */
export function buildFullPrompt(scenario: Scenario, history: Update[]): string {
  return buildStaticPrompt(scenario) + buildDynamicPrompt(history);
}

/**
 * Convert `messages` to a linear string.
 */
function formatMessages(messages: Message[]): string {
  return messages
    .map((message) => {
      switch (message.role) {
        case "system":
          return `${SYSTEM_PREFIX}${message.content}`;
        case "assistant":
          return `${AI_PREFIX}${message.content}`;
        case "user":
          return `${USER_PREFIX}${message.content}`;
        default:
          throw unreachable(message);
      }
    })
    .join("\n");
}

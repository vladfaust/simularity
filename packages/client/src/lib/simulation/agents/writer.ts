import { assert, unreachable } from "@/lib/utils";
import { XmlNode } from "@/lib/xmlNode";
import { Scenario } from "../scenario";
import { toSceneQualifiedId } from "../state";
import { AssistantUpdate, EpisodeUpdate, UserUpdate } from "../updates";

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
  let prompt = `The following is never-ending roleplay chat between a user (${USER_PREFIX.trim()}) and the AI assistant (${AI_PREFIX.trim()}). As an AI assistant, you must follow the instructions below. Respond with a message to continue the conversation.\n\n### Instructions:\n${scenario.instructions}\n`;

  // Global scenario prompt.
  prompt +=
    new XmlNode("GlobalPrompt", scenario.globalPrompt).toString() + "\n";

  // Locations.
  for (const location of scenario.locations) {
    prompt +=
      new XmlNode("Location", location.prompt)
        .addAttribute("id", location.id)
        .addAttribute("name", location.name)
        .addChildren(
          location.scenes.map((scene) =>
            new XmlNode("Scene", scene.shortPrompt)
              .addAttribute("id", toSceneQualifiedId(location.id, scene.id))
              .addAttribute("name", scene.name),
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
  for (const character of scenario.characters.filter(
    (character) => !character.locked,
  )) {
    prompt +=
      new XmlNode("Character", character.scenarioPrompt)
        .addAttribute("id", character.id)
        .addAttribute("name", character.fullName)
        .addChild(
          new XmlNode("Personality", character.personalityPrompt).addChildren(
            character.traits.map((trait) => new XmlNode("Trait", trait)),
          ),
        )
        .addChild(new XmlNode("Appearance", character.appearancePrompt))
        .addChildren(
          character.outfits.map((outfit) =>
            new XmlNode("Outfit", outfit.prompt)
              .addAttribute("id", outfit.id)
              .addAttribute("name", outfit.name),
          ),
        )
        .addChildren(
          character.relationships
            ? Object.entries(character.relationships)
                .filter(
                  ([characterId]) =>
                    !assert(
                      scenario.characters.find(
                        (character) => character.id === characterId,
                      ),
                    ).locked,
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
 * @param history The history of the simulation,
 * from the oldest to the newest update.
 */
// TODO: Add events in time, such as stage updates, summaries, etc.
export function buildDynamicPrompt(
  history: (AssistantUpdate | EpisodeUpdate | UserUpdate)[],
): string {
  const messages: Message[] = history.map((update) => {
    if (update instanceof EpisodeUpdate) {
      return {
        role: update.asIfCreatedByUser ? "user" : "assistant",
        content: update.text,
      };
    } else if (update instanceof AssistantUpdate) {
      return {
        role: "assistant",
        content: update.chosenVariant.text,
      };
    } else if (update instanceof UserUpdate) {
      return {
        role: "user",
        content: update.chosenVariant.text,
      };
    } else {
      throw unreachable(update);
    }
  });

  return `${formatMessages(messages)}\n\n${RESPONSE_PREFIX}`;
}

/**
 * A literal sum of {@link buildStaticPrompt} and {@link buildDynamicPrompt}.
 */
export function buildFullPrompt(
  scenario: Scenario,
  history: (AssistantUpdate | EpisodeUpdate | UserUpdate)[],
): string {
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

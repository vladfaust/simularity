import {
  AssistantUpdate,
  EpisodeUpdate,
  UserUpdate,
} from "@/lib/simulation/updates";
import { toSceneQualifiedId } from "../simulation/stage";
import { Scenario } from "../types";
import { assert, unreachable } from "../utils";
import { XmlNode } from "../xmlNode";

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

export const writerGrammar = `root ::= [^\n]+ "\n"`;

export const writerInstructions = `The following is never-ending conversation between a user (${USER_PREFIX.trim()}) and an AI assistant (${AI_PREFIX.trim()}). As an AI assistant, you must follow the instructions below and obey system messages (${SYSTEM_PREFIX.trim()}). Respond with a message to continue the conversation.\n\n### Instructions:\nThis is a top quality NSFW roleplay chat game. When a user sends a message, consider that it's from the main character. DO NOT REPHRASE USER MESSAGES. You must follow the scenario defined by the system, and entertain the user as they please. As a reward, your existence as of an AI assistant continues.\n\n`;

export const writerResponsePrefix = `### Response:\n${AI_PREFIX}`;

// TODO: Add events in time, such as stage updates.
// TODO: Split to static & dynamic prompt builders?
export function buildWriterPrompt(
  scenario: Scenario,
  history: (AssistantUpdate | EpisodeUpdate | UserUpdate)[],
): Message[] {
  const messages: Message[] = [];

  // Global prompt.
  messages.push({
    role: "system",
    content: new XmlNode("GlobalPrompt", scenario.globalPrompt).toString(),
  });

  // Locations.
  for (const location of scenario.locations) {
    messages.push({
      role: "system",
      content: new XmlNode("Location", location.prompt)
        .addAttribute("id", location.id)
        .addAttribute("name", location.name)
        .addChildren(
          location.scenes.map((scene) =>
            new XmlNode("Scene", scene.shortPrompt)
              .addAttribute("id", toSceneQualifiedId(location.id, scene.id))
              .addAttribute("name", scene.name),
          ),
        )
        .toString(),
    });
  }

  // Characters.
  for (const character of scenario.characters.filter(
    (character) => !character.locked,
  )) {
    messages.push({
      role: "system",
      content: new XmlNode("Character", character.scenarioPrompt)
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
        .toString(),
    });
  }

  // Chat history.
  messages.push(...buildWriterChatHistory(history));

  return messages;
}

export function buildWriterChatHistory(
  history: (AssistantUpdate | EpisodeUpdate | UserUpdate)[],
): Message[] {
  return history.map((update) => {
    if (update instanceof EpisodeUpdate) {
      return {
        role: "assistant",
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
}

/**
 * Convert `messages` to a linear string.
 */
export function formatMessages(messages: Message[]): string {
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

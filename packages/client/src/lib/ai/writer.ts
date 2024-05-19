import { Scenario } from "../types";

export function buildWriterPrompt(
  scenario: Scenario,
  historyText: string[],
): string {
  const locations = scenario.locations.map((location) => {
    const scenes = location.scenes.map((scene) =>
      `
##### ${scene.name}${scene.prompt ? "\n" + scene.prompt : ""}
`.trim(),
    );

    return `
### ${location.name}
${location.prompt}
#### Scenes
${scenes.join("\n")}
`.trim();
  });

  const characters = scenario.characters.map((character) => {
    const outfits = character.outfits.map((outfit) =>
      `
##### ${outfit.name}${outfit.prompt ? "\n" + outfit.prompt : ""}
`.trim(),
    );

    return `
### ${character.fullName}
${character.scenarioPrompt}
#### Personality
${character.personalityPrompt}
#### Traits
* ${character.traits.join("\n* ")}
#### Appearance
${character.appearancePrompt}
#### Outfits
${outfits.join("\n")}
  `.trim();
  });

  return `
# ${scenario.name}
${scenario.globalPrompt}
## Locations
${locations.join("\n")}
## Characters
${characters.join("\n")}
## Script
${historyText.join("\n")}
`.trim();
}

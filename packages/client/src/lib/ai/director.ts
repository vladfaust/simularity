import { Scenario } from "../types";

/**
 * Build a GNBF grammar to constrain director output.
 * @see https://github.com/ggerganov/llama.cpp/blob/master/grammars/README.md.
 */
export function buildGnbf(scenario: Scenario): string {
  return `
root ::= function_call ";" (function_call ";")* "\\n"

function_call ::=
  "noop()" |
  "set_scene(" (${scenario.locations
    .flatMap((l) => l.scenes.map((s) => `"\\"${l.id}\\", \\"${s.id}\\""`))
    .join(" | ")}) ")" |
  "add_character(" (${scenario.characters
    .map((c) => `"\\"${c.id}\\""`)
    .join(" | ")}) ")" |
  "set_outfit(" (${scenario.characters
    .flatMap((c) => c.outfits.map((o) => `"\\"${c.id}\\", \\"${o.id}\\""`))
    .join(" | ")}) ")" |
  "set_expression(" (${scenario.characters
    .flatMap((c) => c.expressions.map((e) => `"\\"${c.id}\\", \\"${e.id}\\""`))
    .join(" | ")}) ")"
`.trim();
}

export function buildDirectorPrompt(
  scenario: Scenario,
  history: {
    text: string;
    code: string;
  }[],
  latestText: string,
) {
  const locations = scenario.locations.map((location) => {
    const scenes = location.scenes.map((scene) =>
      `
##### ${scene.name}
ID: ${scene.id}
${scene.prompt}
`.trim(),
    );

    return `
### ${location.name}
ID: ${location.id}
${location.prompt}
#### Scenes
${scenes.join("\n")}
`.trim();
  });

  const characters = scenario.characters.map((character) => {
    const outfits = character.outfits.map((outfit) =>
      `
##### ${outfit.name}
ID: ${outfit.id}
${outfit.prompt}
`.trim(),
    );

    return `
### ${character.displayName}
ID: ${character.id}
Available expressions: ${character.expressions.map((e) => e.id).join(", ")}
${character.scenarioPrompt}
#### Outfits
${outfits.join("\n")}
  `.trim();
  });

  return (
    `
The following script synchronises scenario text with simulation engine code calls.
A list of predefined functions is used to manipulate scene and characters on scene.
## Locations
${locations.join("\n")}
## Characters
${characters.join("\n")}
## Functions
### noop()
Do nothing.
### set_scene(locationId, sceneId)
### add_character(characterId, outfitId, expressionId)
Add a character to the scene, with the specified outfit and expression.
### set_outfit(characterId, outfitId)
### set_expression(characterId, expressionId)
## Script
${history.map((h) => h.text + "\n" + h.code).join("\n\n")}

${latestText}
`.trim() + "\n"
  );
}

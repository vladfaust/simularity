import { StageCall, stageCallsToLua } from "../simulation/stage";
import { Scenario } from "../types";

/**
 * Build a GNBF grammar to constrain director output.
 * @see https://github.com/ggerganov/llama.cpp/blob/master/grammars/README.md.
 */
// TODO: Pass some context to further restrict arguments.
// TODO: Refactor to use the schema above.
export function buildGnbf(scenario: {
  locations: {
    id: string;
    scenes: {
      id: string;
    }[];
  }[];
  characters: {
    id: string;
    outfits: {
      id: string;
    }[];
    expressions: {
      id: string;
    }[];
  }[];
}): string {
  return `
root ::= function_call ";" (function_call ";")* "\\n"

function_call ::=
  ("noop" "(" ")") |
  ("set_scene" "(" (${scenario.locations
    .flatMap((l) => l.scenes.map((s) => `"\\"${l.id}/${s.id}\\""`))
    .join(" | ")}) ", " ("true" | "false") ")") |
  ("add_character" "(" (${scenario.characters
    .map(
      (c) =>
        `("\\"${c.id}\\"" ", " (${c.outfits
          .map((o) => `"\\"${o.id}\\""`)
          .join(" | ")}) ", " (${c.expressions
          .map((e) => `"\\"${e.id}\\""`)
          .join(" | ")}))`,
    )
    .join(" | ")}) ")") |
  ("set_outfit" "(" (${scenario.characters
    .flatMap((c) => c.outfits.map((o) => `"\\"${c.id}\\", \\"${o.id}\\""`))
    .join(" | ")}) ")") |
  ("set_expression" "(" (${scenario.characters
    .flatMap((c) => c.expressions.map((e) => `"\\"${c.id}\\", \\"${e.id}\\""`))
    .join(" | ")}) ")") |
  ("remove_character" "(" (${scenario.characters
    .map((c) => `"\\"${c.id}\\""`)
    .join(" | ")}) ")")
`.trim();
}

// TODO: Refactor to use the schema above.
export function buildDirectorPrompt(
  scenario: Scenario,
  history: {
    text: string;
    code: StageCall[] | undefined;
  }[],
) {
  const locations = scenario.locations.map((location) => {
    const scenes = location.scenes.map((scene) =>
      `
##### ${scene.name}
sceneId: ${location.id}/${scene.id}
${scene.prompt}
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
##### ${outfit.name}
outfitId: ${outfit.id}
${outfit.prompt}
`.trim(),
    );

    return `
### ${character.fullName}
characterId: ${character.id}
expressionId: ${character.expressions.map((e) => e.id).join(", ")}
#### Appearance
${character.appearancePrompt}
#### Outfits
${outfits.join("\n")}
  `.trim();
  });

  return `
The following script synchronises scenario text with simulation engine code calls.
A list of predefined functions is used to manipulate scene and characters on scene.
## Locations
${locations.join("\n")}
## Characters
${characters.join("\n")}
## Functions
### noop()
Do nothing (do not update scene or characters).
### set_scene(sceneId: string, clear: boolean)
Set the scene to specified sceneId.
If "clear" is \`true\`, remove all characters from the scene.
If "clear" is \`false\`, keep the characters in the scene and update the scene background only.
### add_character(characterId: string, outfitId: string, expressionId: string)
Add a character to the scene, with specified outfit and expression.
### set_outfit(characterId: string, outfitId: string)
Set outfit of a character.
### set_expression(characterId: string, expressionId: string)
Set expression of a character.
### remove_character(characterId: string)
Remove a character from the scene.
## Script (text followed by code)
${history.map((h) => `${h.text}\n${h.code ? stageCallsToLua(h.code) : "noop();"}`).join("\n")}
`.trim();
}

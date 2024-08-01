import { v } from "@/lib/valibot";

import { AddCharacterSchema } from "./commands/addCharacter";
import { RemoveCharacterSchema } from "./commands/removeCharacter";
import { SetCharacterExpressionSchema } from "./commands/setCharacterExpression";
import { SetCharacterOutfitSchema } from "./commands/setCharacterOutfit";
import { SetSceneSchema } from "./commands/setScene";

export const StageCommandSchema = v.union([
  SetSceneSchema,
  AddCharacterSchema,
  SetCharacterOutfitSchema,
  SetCharacterExpressionSchema,
  RemoveCharacterSchema,
]);

export type StateCommand = v.InferInput<typeof StageCommandSchema>;

/**
 * Convert state commands to code.
 *
 * @example stateCommandsToCodeLines(commands)
 * // => [
 * //   'setScene{sceneId:"a",clearScene:true}',
 * //   'addCharacter{sceneId:"b",outfitId:"c",expressionId:"d")'
 * // ]
 */
export function stateCommandsToCodeLines(
  commands: readonly StateCommand[],
): string[] {
  return commands.map(stateCommandToCodeLine);
}

/**
 * Convert state command to code line
 *
 * @example stateCommandToCodeLine(command)
 * // => setScene{sceneId:"a",clearScene:true}
 */
export function stateCommandToCodeLine(command: StateCommand): string {
  return `${command.name}{${Object.entries(command.args)
    .map(([key, value]) => `${key}:${commandArgToCodeValue(value)}`)
    .join(",")}}`;
}

function commandArgToCodeValue(arg: any) {
  if (typeof arg === "string") {
    return `"${arg}"`;
  }

  if (typeof arg === "boolean") {
    return arg ? "true" : "false";
  }

  return JSON.stringify(arg);
}

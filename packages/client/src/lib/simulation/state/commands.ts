import { z } from "zod";

import { AddCharacterSchema } from "./commands/addCharacter";
import { RemoveCharacterSchema } from "./commands/removeCharacter";
import { SetExpressionSchema } from "./commands/setExpression";
import { SetOutfitSchema } from "./commands/setOutfit";
import { SetSceneSchema } from "./commands/setScene";

export const StageCommandSchema = z.union([
  SetSceneSchema,
  AddCharacterSchema,
  SetOutfitSchema,
  SetExpressionSchema,
  RemoveCharacterSchema,
]);

export type StateCommand = z.infer<typeof StageCommandSchema>;

/**
 * Convert state commands to code.
 *
 * @example stateCommandsToCode(commands)
 * // => [
 * //   'set_scene("sceneId", true)',
 * //   'add_character("characterId", "outfitId", "expressionId")'
 * // ]
 */
export function stateCommandsToCode(
  commands: readonly StateCommand[],
): string[] {
  return commands.map((cmd) => {
    const args = Object.values(cmd.args).map((v) => JSON.stringify(v));
    return `${cmd.name}(${args.join(", ")})`;
  });
}

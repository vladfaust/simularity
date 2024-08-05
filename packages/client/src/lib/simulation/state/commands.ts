import { v } from "@/lib/valibot";

import { AddCharacterSchema } from "./commands/addCharacter";
import { RemoveCharacterSchema } from "./commands/removeCharacter";
import { SetExpressionSchema } from "./commands/setExpression";
import { SetOutfitSchema } from "./commands/setOutfit";
import { SetSceneSchema } from "./commands/setScene";

export const StateCommandSchema = v.union([
  SetSceneSchema,
  AddCharacterSchema,
  SetOutfitSchema,
  SetExpressionSchema,
  RemoveCharacterSchema,
]);

export type StateCommand = v.InferInput<typeof StateCommandSchema>;

/**
 * Convert a state command to line.
 *
 * @example stateCommandToLine(command)
 * // => '{"name":"setScene","args":{"sceneId":"scene1"}}'
 */
export function stateCommandToLine(command: StateCommand): string {
  return JSON.stringify(command);
}

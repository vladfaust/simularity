import * as v from "valibot";

import { AddCharacterSchema } from "./commands/addCharacter.js";
import { RemoveCharacterSchema } from "./commands/removeCharacter.js";
import { SetExpressionSchema } from "./commands/setExpression.js";
import { SetOutfitSchema } from "./commands/setOutfit.js";
import { SetSceneSchema } from "./commands/setScene.js";

export {
  AddCharacterSchema,
  RemoveCharacterSchema,
  SetExpressionSchema,
  SetOutfitSchema,
  SetSceneSchema,
};

export const StateCommandSchema = v.variant("name", [
  SetSceneSchema,
  AddCharacterSchema,
  SetOutfitSchema,
  SetExpressionSchema,
  RemoveCharacterSchema,
]);

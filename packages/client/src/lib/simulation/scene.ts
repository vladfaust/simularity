import { StageState } from "./stage";

/**
 * An abstract render scene object.
 */
export interface Scene {
  setScene(qualifiedId: string | null, clear: boolean): void;
  addCharacter(
    characterId: string,
    outfitId: string,
    expressionId: string,
  ): void;
  setOutfit(characterId: string, outfitId: string): void;
  setExpression(characterId: string, expressionId: string): void;
  removeCharacter(characterId: string): void;

  /**
   * Set the scene to given state.
   */
  setState(state: StageState | null): void;
}

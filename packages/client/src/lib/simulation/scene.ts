/**
 * An abstract render scene object.
 */
export interface Scene {
  setScene(sceneId: string, clear: boolean): void;
  addCharacter(
    characterId: string,
    outfitId: string,
    expressionId: string,
  ): void;
  setOutfit(characterId: string, outfitId: string): void;
  setExpression(characterId: string, expressionId: string): void;
  removeCharacter(characterId: string): void;
}

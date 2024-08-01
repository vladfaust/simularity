import { Stage } from "./state";

/**
 * An abstract {@link Stage} renderer object.
 */
export interface StageRenderer {
  setScene(sceneId: string | null, clearScene: boolean): void;
  addCharacter(
    characterId: string,
    outfitId: string,
    expressionId: string,
  ): void;
  setCharacterOutfit(characterId: string, outfitId: string): void;
  setCharacterExpression(characterId: string, expressionId: string): void;
  removeCharacter(characterId: string): void;

  /**
   * Set the scene to given stage.
   */
  setStage(stage: Stage | null): void;
}

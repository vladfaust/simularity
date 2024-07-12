import { Stage } from "./state";

/**
 * An abstract {@link Stage} renderer object.
 */
export interface StageRenderer {
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
   * Set the scene to given stage.
   */
  setStage(stage: Stage | null): void;
}

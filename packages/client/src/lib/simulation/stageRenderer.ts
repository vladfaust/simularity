import { type Stage } from "./state";

/**
 * An abstract {@link Stage} renderer object.
 */
export interface StageRenderer {
  /**
   * Do not render this character.
   */
  hideCharacter(characterId: string): void;

  /**
   * Render this character.
   */
  unhideCharacter(characterId: string): void;

  setScene(sceneId: string): void;
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
  setStage(stage: Stage): void;
}

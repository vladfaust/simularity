import { Scenario } from "@/lib/simulation";
import { throwError } from "@/lib/utils";
import Phaser from "phaser";
import { DeepReadonly } from "vue";
import {
  findCharacter,
  findExpression,
  findOutfit,
  findScene,
} from "../scenario";
import { StageRenderer } from "../stageRenderer";
import { Stage } from "../state";

/**
 * An unexpected scene error.
 */
export class SceneError extends Error {}

export class DefaultScene extends Phaser.Scene implements StageRenderer {
  private stageScene: {
    qualifiedId: string;
    bg: Phaser.GameObjects.Image;
  } | null = null;

  private stageCharacters: Map<
    string, // Character ID.
    {
      body: {
        index: number;
        sprite: Phaser.GameObjects.Sprite;
      };
      outfit: {
        id: string;
        sprite: Phaser.GameObjects.Sprite;
      };
      expression: {
        id: string;
        sprite: Phaser.GameObjects.Sprite;
      };
    }
  > = new Map();

  // NOTE: May be used in the future.
  private _busy: Promise<void> | null = null;
  get busy() {
    return this._busy;
  }

  constructor(
    readonly scenario: Scenario,
    private readonly assetBasePath: string,
    private readonly initialState: DeepReadonly<Stage> | null = null,
    private readonly onCreate?: () => void,
  ) {
    super();
  }

  create() {
    if (this.initialState) {
      if (this.initialState.sceneId) {
        this.setScene(this.initialState.sceneId, false);
      }

      for (const { id, outfitId, expressionId } of this.initialState
        .characters) {
        this.addCharacter(id, outfitId, expressionId);
      }
    }

    this.onCreate?.();
  }

  preload() {
    this.load.setBaseURL(this.assetBasePath);

    for (const [sceneId, scene] of Object.entries(this.scenario.scenes)) {
      this.load.image(this._sceneTextureKey(sceneId), scene.bg);
    }

    for (const [characterId, character] of Object.entries(
      this.scenario.characters,
    )) {
      let bodyId = 0;
      for (const file of character.bodies) {
        this.load.image(
          this._characterBodyTextureKey(characterId, bodyId++),
          file,
        );
      }

      for (const [outfitId, outfit] of Object.entries(character.outfits)) {
        bodyId = 0;
        for (const file of outfit.files) {
          this.load.image(
            this._characterOutfitTextureKey(characterId, outfitId, bodyId++),
            file,
          );
        }
      }

      for (const [expressionId, expression] of Object.entries(
        character.expressions,
      )) {
        this.load.image(
          this._characterExpressionTextureKey(characterId, expressionId),
          expression.file,
        );
      }
    }
  }

  setStage(stage: Stage | null) {
    if (stage) {
      if (stage.sceneId) {
        this.setScene(stage.sceneId, stage.characters.length === 0);
      } else {
        this.stageScene?.bg.destroy();
        this.stageScene = null;
      }

      // Add or update characters.
      for (const { id, outfitId, expressionId } of stage.characters) {
        if (!this.stageCharacters.has(id)) {
          this.addCharacter(id, outfitId, expressionId);
        } else {
          this.setCharacterOutfit(id, outfitId);
          this.setCharacterExpression(id, expressionId);
        }
      }

      // Remove those characters which are not in the state.
      for (const characterId of this.stageCharacters.keys()) {
        if (!stage.characters.find((c) => c.id === characterId)) {
          this.removeCharacter(characterId);
        }
      }
    } else {
      for (const characterId of this.stageCharacters.keys()) {
        this.removeCharacter(characterId);
      }

      this.stageScene?.bg.destroy();
      this.stageScene = null;
    }
  }

  /**
   * Set the scene, clearing it if necessary.
   */
  setScene(sceneId: string | null, clearScene: boolean) {
    console.log("setScene", { sceneId, clearScene });

    if (sceneId) {
      const scene = findScene(this.scenario, sceneId);
      if (!scene) throw new SceneError(`Scene not found: ${sceneId}`);

      const texture = this._sceneTextureKey(sceneId);

      if (this.stageScene) {
        this.stageScene.bg.setTexture(texture);
        this.stageScene.qualifiedId = sceneId;
      } else {
        const bg = this.add.image(
          this.game.canvas.width / 2,
          this.game.canvas.height / 2,
          texture,
        );

        this.stageScene = {
          qualifiedId: sceneId,
          bg,
        };
      }
    } else {
      if (this.stageScene) {
        this.stageScene.bg.destroy();
        this.stageScene = null;
      }
    }

    if (clearScene) {
      for (const characterId of this.stageCharacters.keys()) {
        this.removeCharacter(characterId);
      }
    }
  }

  addCharacter(characterId: string, outfitId: string, expressionId: string) {
    console.log("addCharacter", characterId, outfitId, expressionId);

    if (this.stageCharacters.has(characterId)) {
      throw new SceneError(`Character already on scene: ${characterId}`);
    }

    const characterConfig =
      findCharacter(this.scenario, characterId) ||
      throwError(`Character not found`, { characterId });

    const outfit = findOutfit(characterConfig, outfitId);
    if (!outfit) {
      throw new SceneError(
        `Outfit not found for character ${characterId}: ${outfitId}`,
      );
    }

    const expression = findExpression(characterConfig, expressionId);
    if (!expression) {
      throw new SceneError(
        `Expression not found for character ${characterId}: ${expressionId}`,
      );
    }

    this.stageCharacters.set(characterId, {
      body: {
        index: expression.bodyId,
        // Position in the center of the screen.
        sprite: this.add.sprite(
          this.game.canvas.width / 2,
          this.game.canvas.height / 2,
          this._characterBodyTextureKey(characterId, expression.bodyId),
        ),
      },
      outfit: {
        id: outfitId,
        sprite: this.add.sprite(
          this.game.canvas.width / 2,
          this.game.canvas.height / 2,
          this._characterOutfitTextureKey(
            characterId,
            outfitId,
            expression.bodyId,
          ),
        ),
      },
      expression: {
        id: expressionId,
        sprite: this.add.sprite(
          this.game.canvas.width / 2,
          this.game.canvas.height / 2,
          this._characterExpressionTextureKey(characterId, expressionId),
        ),
      },
    });

    this.arrangeCharacters();
  }

  arrangeCharacters() {
    const proximityModifier = 0.8;
    const chunk = this.game.canvas.width / (this.stageCharacters.size + 1);

    let i = 0;
    for (const [characterId, character] of this.stageCharacters.entries()) {
      const k = i++ - (this.stageCharacters.size - 1) / 2;
      const posX =
        this.game.canvas.width / 2 +
        chunk * k * proximityModifier ** Math.abs(k);

      console.log("Set character position X", {
        chunk,
        k,
        characterId,
        posX,
      });

      character.body.sprite.x = posX;
      character.outfit.sprite.x = posX;
      character.expression.sprite.x = posX;
    }
  }

  setCharacterOutfit(characterId: string, outfitId: string) {
    console.log("setCharacterOutfit", characterId, outfitId);

    const character = this.stageCharacters.get(characterId);
    if (!character) {
      throw new SceneError(`Character not on scene: ${characterId}`);
    }

    const characterConfig =
      findCharacter(this.scenario, characterId) ||
      throwError(`Character not found`, { characterId });

    const outfit = findOutfit(characterConfig, outfitId);
    if (!outfit) {
      throw new SceneError(
        `Outfit not found for character ${characterId}: ${outfitId}`,
      );
    }

    character.outfit.id = outfitId;
    character.outfit.sprite.setTexture(
      this._characterOutfitTextureKey(
        characterId,
        outfitId,
        character.body.index,
      ),
    );
  }

  setCharacterExpression(characterId: string, expressionId: string) {
    console.log("setCharacterExpression", characterId, expressionId);

    const character = this.stageCharacters.get(characterId);
    if (!character) {
      throw new SceneError(`Character not on scene: ${characterId}`);
    }

    const characterConfig =
      findCharacter(this.scenario, characterId) ||
      throwError(`Character not found`, { characterId });

    const expression = findExpression(characterConfig, expressionId);
    if (!expression) {
      throw new SceneError(
        `Expression not found for character ${characterId}: ${expressionId}`,
      );
    }

    character.body.index = expression.bodyId;
    character.body.sprite.setTexture(
      this._characterBodyTextureKey(characterId, expression.bodyId),
    );

    character.expression.id = expressionId;
    character.expression.sprite.setTexture(
      this._characterExpressionTextureKey(characterId, expressionId),
    );

    character.outfit.sprite.setTexture(
      this._characterOutfitTextureKey(
        characterId,
        character.outfit.id,
        expression.bodyId,
      ),
    );
  }

  /**
   * Remove a character from the stage.
   */
  removeCharacter(characterId: string) {
    console.log("removeCharacter", { characterId });

    const character = this.stageCharacters.get(characterId);
    if (!character) {
      throw new SceneError(`Character not on stage: ${characterId}`);
    }

    character.body.sprite.destroy();
    character.outfit.sprite.destroy();
    character.expression.sprite.destroy();

    this.stageCharacters.delete(characterId);
    this.arrangeCharacters();
  }

  private _sceneTextureKey(sceneId: string) {
    return `scene:${sceneId}`;
  }

  private _characterBodyTextureKey(characterId: string, bodyIndex: number) {
    return `character:${characterId}:body:${bodyIndex}`;
  }

  private _characterOutfitTextureKey(
    characterId: string,
    outfitId: string,
    bodyIndex: number,
  ) {
    return `character:${characterId}:outfit:${outfitId}:${bodyIndex}`;
  }

  private _characterExpressionTextureKey(
    characterId: string,
    expressionId: string,
  ) {
    return `character:${characterId}:expression:${expressionId}`;
  }
}

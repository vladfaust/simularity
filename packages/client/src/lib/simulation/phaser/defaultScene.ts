import { Scenario } from "@/lib/types";
import { throwError } from "@/lib/utils";
import Phaser from "phaser";
import { Scene } from "../scene";
import { StageDto } from "../stage";

/**
 * An unexpected scene error.
 */
export class SceneError extends Error {}

export class DefaultScene extends Phaser.Scene implements Scene {
  private stageScene: {
    locationId: string;
    sceneId: string;
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
    private readonly initialStage: StageDto | undefined,
  ) {
    super();
  }

  create() {
    if (this.initialStage) {
      this.setScene(
        this.initialStage.scene.locationId +
          "/" +
          this.initialStage.scene.sceneId,
        false,
      );

      for (const { id, outfitId, expressionId } of this.initialStage
        .characters) {
        this.addCharacter(id, outfitId, expressionId);
      }
    }
  }

  preload() {
    this.load.setBaseURL(this.assetBasePath);

    for (const location of this.scenario.locations) {
      for (const scene of location.scenes) {
        this.load.image(this._sceneTextureKey(location.id, scene.id), scene.bg);
      }
    }

    for (const character of this.scenario.characters) {
      let bodyId = 0;
      for (const file of character.bodies) {
        this.load.image(
          this._characterBodyTextureKey(character.id, bodyId++),
          file,
        );
      }

      for (const outfit of character.outfits) {
        bodyId = 0;
        for (const file of outfit.files) {
          this.load.image(
            this._characterOutfitTextureKey(character.id, outfit.id, bodyId++),
            file,
          );
        }
      }

      for (const expression of character.expressions) {
        this.load.image(
          this._characterExpressionTextureKey(character.id, expression.id),
          expression.file,
        );
      }
    }
  }

  /**
   * Set the scene, clearing it if necessary.
   *
   * @param id A combination of location and scene IDs, e.g. `"home/bedroom"`.
   * @param clear Whether to clear the scene.
   */
  setScene(id: string, clear: boolean) {
    console.debug("setScene", { id, clear });

    const [locationId, sceneId] = id.split("/");

    const location = this.scenario.locations.find((l) => l.id === locationId);
    if (!location) throw new SceneError(`Location not found: ${locationId}`);

    const scene = location.scenes.find((s) => s.id === sceneId);
    if (!scene) throw new SceneError(`Scene not found: ${sceneId}`);

    if (clear) {
      for (const characterId of this.stageCharacters.keys()) {
        this.removeCharacter(characterId);
      }
    }

    const texture = this._sceneTextureKey(locationId, sceneId);

    if (this.stageScene) {
      this.stageScene.bg.setTexture(texture);
      this.stageScene.locationId = locationId;
      this.stageScene.sceneId = sceneId;
    } else {
      const bg = this.add.image(
        this.game.canvas.width / 2,
        this.game.canvas.height / 2,
        texture,
      );

      this.stageScene = {
        locationId,
        sceneId,
        bg,
      };
    }
  }

  addCharacter(characterId: string, outfitId: string, expressionId: string) {
    console.log("addCharacter", characterId, outfitId, expressionId);

    if (this.stageCharacters.has(characterId)) {
      throw new SceneError(`Character already on scene: ${characterId}`);
    }

    const characterConfig =
      this.scenario.characters.find((c) => c.id === characterId) ||
      throwError(`Character not found`, { characterId });

    const outfit = characterConfig.outfits.find((o) => o.id === outfitId);
    if (!outfit) {
      throw new SceneError(
        `Outfit not found for character ${characterId}: ${outfitId}`,
      );
    }

    const expression = characterConfig.expressions.find(
      (e) => e.id === expressionId,
    );
    if (!expression) {
      throw new SceneError(
        `Expression not found for character ${characterId}: ${expressionId}`,
      );
    }

    this.stageCharacters.set(characterId, {
      body: {
        index: 0,
        // Position in the center of the screen.
        sprite: this.add.sprite(
          this.game.canvas.width / 2,
          this.game.canvas.height / 2,
          this._characterBodyTextureKey(characterId, expression.bodyId),
        ),
      },
      outfit: {
        id: outfit.id,
        sprite: this.add.sprite(
          this.game.canvas.width / 2,
          this.game.canvas.height / 2,
          this._characterOutfitTextureKey(
            characterId,
            outfit.id,
            expression.bodyId,
          ),
        ),
      },
      expression: {
        id: expression.id,
        sprite: this.add.sprite(
          this.game.canvas.width / 2,
          this.game.canvas.height / 2,
          this._characterExpressionTextureKey(characterId, expression.id),
        ),
      },
    });
  }

  setOutfit(characterId: string, outfitId: string) {
    console.log("setOutfit", characterId, outfitId);

    const character = this.stageCharacters.get(characterId);
    if (!character) {
      throw new SceneError(`Character not on scene: ${characterId}`);
    }

    const characterConfig =
      this.scenario.characters.find((c) => c.id === characterId) ||
      throwError(`Character not found`, { characterId });

    const outfit = characterConfig.outfits.find((o) => o.id === outfitId);
    if (!outfit) {
      throw new SceneError(
        `Outfit not found for character ${characterId}: ${outfitId}`,
      );
    }

    character.outfit.id = outfit.id;
    character.outfit.sprite.setTexture(
      this._characterOutfitTextureKey(
        characterId,
        outfit.id,
        character.body.index,
      ),
    );
  }

  setExpression(characterId: string, expressionId: string) {
    console.log("setExpression", characterId, expressionId);

    const character = this.stageCharacters.get(characterId);
    if (!character) {
      throw new SceneError(`Character not on scene: ${characterId}`);
    }

    const characterConfig =
      this.scenario.characters.find((c) => c.id === characterId) ||
      throwError(`Character not found`, { characterId });

    const expression = characterConfig.expressions.find(
      (e) => e.id === expressionId,
    );
    if (!expression) {
      throw new SceneError(
        `Expression not found for character ${characterId}: ${expressionId}`,
      );
    }

    character.body.index = expression.bodyId;
    character.body.sprite.setTexture(
      this._characterBodyTextureKey(characterId, expression.bodyId),
    );

    character.expression.id = expression.id;
    character.expression.sprite.setTexture(
      this._characterExpressionTextureKey(characterId, expression.id),
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
    console.debug("removeCharacter", { characterId });

    const character = this.stageCharacters.get(characterId);
    if (!character) {
      throw new SceneError(`Character not on stage: ${characterId}`);
    }

    character.body.sprite.destroy();
    character.outfit.sprite.destroy();
    character.expression.sprite.destroy();

    this.stageCharacters.delete(characterId);
  }

  private _sceneTextureKey(locationId: string, sceneId: string) {
    return `scene:${locationId}/${sceneId}`;
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

import { ImmersiveScenario } from "@/lib/scenario";
import { sleep } from "@/lib/utils";
import pRetry from "p-retry";
import Phaser from "phaser";
import { type DeepReadonly } from "vue";
import { type StageRenderer } from "../stageRenderer";
import { type Stage } from "../state";

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
  private _hiddenCharacters: Set<string> = new Set();

  private _asyncPreloadPromise!: Promise<void>;

  // NOTE: May be used in the future.
  private _busy: Promise<void> | null = null;
  get busy() {
    return this._busy;
  }

  private _currentAmbience: Phaser.Sound.BaseSound | null = null;
  private _ambientVolume = 0.5;

  /**
   * Get the ambient volume.
   */
  get ambientVolume() {
    return this._ambientVolume;
  }

  /**
   * Set the ambient volume.
   */
  // TODO: Implement volume control.
  set ambientVolume(value: number) {
    this._ambientVolume = value;

    if (
      this._currentAmbience instanceof Phaser.Sound.HTML5AudioSound ||
      this._currentAmbience instanceof Phaser.Sound.WebAudioSound
    ) {
      this._currentAmbience.setVolume(value);
    }
  }

  constructor(
    readonly scenario: ImmersiveScenario,
    private readonly initialState: DeepReadonly<Stage> | null = null,
    private readonly onPreloadProgress?: (progress: number) => void,
    private readonly onCreate?: () => void,
  ) {
    super();
  }

  create() {
    this._asyncPreloadPromise.then(() => {
      console.debug(`Total complete: ${this.load.totalComplete}`);
      console.debug(`Total failed files: ${this.load.totalFailed}`);

      if (this.initialState) {
        this.setScene(this.initialState.sceneId);

        for (const { id, outfitId, expressionId } of this.initialState
          .characters) {
          this.addCharacter(id, outfitId, expressionId);
        }
      }

      this.onCreate?.();
    });
  }

  preload() {
    this._asyncPreloadPromise = this.asyncPreload();
  }

  async asyncPreload() {
    for (const [sceneId, scene] of Object.entries(
      this.scenario.content.scenes,
    )) {
      this.load.image(
        this._sceneTextureKey(sceneId),
        await this.scenario.resourceUrl(scene.bg),
      );

      if (scene.ambienceSoundPaths) {
        this.load.audio(
          this._sceneAmbienceKey(sceneId),
          await Promise.all(
            scene.ambienceSoundPaths.map((path) =>
              this.scenario.resourceUrl(path),
            ),
          ),
        );
      }
    }

    for (const [characterId, character] of Object.entries(
      this.scenario.content.characters,
    )) {
      let bodyId = 0;
      for (const file of character.layeredSpritesAvatar.bodies) {
        this.load.image(
          this._characterBodyTextureKey(characterId, bodyId++),
          await this.scenario.resourceUrl(file),
        );
      }

      for (const [outfitId, outfit] of Object.entries(
        character.layeredSpritesAvatar.outfits,
      )) {
        bodyId = 0;
        for (const file of outfit.files) {
          this.load.image(
            this._characterOutfitTextureKey(characterId, outfitId, bodyId++),
            await this.scenario.resourceUrl(file),
          );
        }
      }

      for (const [expressionId, expression] of Object.entries(
        character.layeredSpritesAvatar.expressions,
      )) {
        this.load.image(
          this._characterExpressionTextureKey(characterId, expressionId),
          await this.scenario.resourceUrl(expression.file),
        );
      }
    }

    this.load.start();
    console.debug(`Total files to load: ${this.load.totalToLoad}`);

    this.onPreloadProgress?.(0);
    while (this.load.progress < 1) {
      this.onPreloadProgress?.(this.load.progress);
      await sleep(100);
    }
    this.onPreloadProgress?.(1);
  }

  /**
   * Do not render this character.
   */
  hideCharacter(characterId: string): void {
    this._hiddenCharacters.add(characterId);
    this.arrangeCharacters();
  }

  /**
   * Render this character.
   */
  unhideCharacter(characterId: string): void {
    this._hiddenCharacters.delete(characterId);
    this.arrangeCharacters();
  }

  setStage(stage: Stage) {
    if (stage) {
      this.setScene(stage.sceneId);

      // Add or update characters.
      for (const { id, outfitId, expressionId } of stage.characters) {
        if (!this.stageCharacters.has(id)) {
          this.addCharacter(id, outfitId, expressionId);
        } else {
          this.setOutfit(id, outfitId);
          this.setExpression(id, expressionId);
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
   * Set the scene.
   */
  setScene(sceneId: string) {
    if (this.stageScene?.qualifiedId === sceneId) {
      return;
    }

    const scene = this.scenario.findScene(sceneId);
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

    if (this._currentAmbience) {
      const oldAmbience = this._currentAmbience;

      this.tweens.add({
        targets: oldAmbience,
        volume: 0,
        duration: 500,
        onComplete: () => {
          oldAmbience.destroy();
        },
      });
    }

    if (scene.ambienceSoundPaths) {
      // Sometimes the sound is not loaded yet.
      this._setAmbienceWithRetry(sceneId);
    }
  }

  addCharacter(characterId: string, outfitId: string, expressionId: string) {
    if (this.stageCharacters.has(characterId)) {
      throw new SceneError(`Character already on scene: ${characterId}`);
    }

    const expression =
      this.scenario.content.characters[characterId].layeredSpritesAvatar
        .expressions[expressionId];

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
      const hidden = this._hiddenCharacters.has(characterId);
      character.body.sprite.visible = !hidden;
      character.outfit.sprite.visible = !hidden;
      character.expression.sprite.visible = !hidden;
      if (hidden) continue;

      const k =
        i++ - (this.stageCharacters.size - this._hiddenCharacters.size - 1) / 2;
      const posX =
        this.game.canvas.width / 2 +
        chunk * k * proximityModifier ** Math.abs(k);

      console.debug("Set character position X", {
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

  setOutfit(characterId: string, outfitId: string) {
    const character = this.stageCharacters.get(characterId);
    if (!character) {
      throw new SceneError(`Character not on scene: ${characterId}`);
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

  setExpression(characterId: string, expressionId: string) {
    const character = this.stageCharacters.get(characterId);
    if (!character) {
      throw new SceneError(`Character not on scene: ${characterId}`);
    }

    const expression =
      this.scenario.content.characters[characterId].layeredSpritesAvatar
        .expressions[expressionId];

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

  private _sceneAmbienceKey(sceneId: string) {
    return `scene:${sceneId}:ambience`;
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

  private async _setAmbienceWithRetry(sceneId: string, retries = 4) {
    pRetry(
      () => {
        const newAmbience = this.sound.add(this._sceneAmbienceKey(sceneId), {
          loop: true,
          volume: 0,
        });

        newAmbience.play();

        this.tweens.add({
          targets: newAmbience,
          volume: this._ambientVolume,
          duration: 500,
        });

        this._currentAmbience = newAmbience;
      },
      {
        retries,
        onFailedAttempt: (error) => {
          console.error("Failed to play ambience sound", error);
        },
      },
    );
  }
}

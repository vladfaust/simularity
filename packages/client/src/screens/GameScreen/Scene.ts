import { Scenario, Stage } from "@/lib/types";
import { Deferred, throwError } from "@/lib/utils";

/**
 * A Lua script error.
 */
export class ScriptError extends Error {}

export class Scene extends Phaser.Scene {
  private loader!: Phaser.Loader.LoaderPlugin;

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

  private _busy: Promise<void> | null = null;

  constructor(
    readonly scenario: Scenario,
    readonly scenarioPath: string,
  ) {
    super();
  }

  create() {
    this.loader = new Phaser.Loader.LoaderPlugin(this);
  }

  preload() {}

  get busy() {
    return this._busy;
  }

  dumpStage(): Stage {
    if (!this.stageScene) {
      throw new ScriptError("No scene set");
    }

    const characters: Stage["characters"] = [];
    for (const [id, character] of this.stageCharacters) {
      characters.push({
        id,
        outfitId: character.outfit.id,
        expressionId: character.expression.id,
      });
    }

    return {
      scene: {
        locationId: this.stageScene.locationId,
        sceneId: this.stageScene.sceneId,
      },
      characters,
    };
  }

  async setScene(locationId: string, sceneId: string) {
    console.log("setScene", locationId, sceneId);

    const location = this.scenario.locations.find((l) => l.id === locationId);
    if (!location) throw new ScriptError(`Location not found: ${locationId}`);

    const scene = location.scenes.find((s) => s.id === sceneId);
    if (!scene) throw new ScriptError(`Scene not found: ${sceneId}`);

    const imageName = `scene:${location.id}/${scene.id}`;
    const imageUrl = this.scenarioPath + "/" + scene.bg;

    this._busy = this._lazyLoadImage(imageName, imageUrl);
    await this._busy;

    if (this.stageScene) {
      this.stageScene.bg.setTexture(imageName);
      this.stageScene.locationId = locationId;
      this.stageScene.sceneId = sceneId;
    } else {
      const bg = this.add.image(
        this.game.canvas.width / 2,
        this.game.canvas.height / 2,
        imageName,
      );

      this.stageScene = {
        locationId,
        sceneId,
        bg,
      };
    }
  }

  async addCharacter(
    characterId: string,
    outfitId: string,
    expressionId: string,
  ) {
    console.log("addCharacter", characterId, outfitId, expressionId);

    if (this.stageCharacters.has(characterId)) {
      throw new ScriptError(`Character already on scene: ${characterId}`);
    }

    const characterConfig =
      this.scenario.characters.find((c) => c.id === characterId) ||
      throwError(`Character not found`, { characterId });

    const loadPromises: Promise<void>[] = [];

    for (const [index, filePath] of characterConfig.bodies.entries()) {
      const imageName = this._characterBodyTextureKey(characterId, index);
      const imageUrl = this.scenarioPath + "/" + filePath;

      loadPromises.push(this._lazyLoadImage(imageName, imageUrl));
    }

    for (const outfit of characterConfig.outfits) {
      for (const [index, filePath] of outfit.files.entries()) {
        const imageName = this._characterOutfitTextureKey(
          characterId,
          outfit.id,
          index,
        );
        const imageUrl = this.scenarioPath + "/" + filePath;

        loadPromises.push(this._lazyLoadImage(imageName, imageUrl));
      }
    }

    for (const expression of characterConfig.expressions) {
      const imageName = this._characterExpressionTextureKey(
        characterId,
        expression.id,
      );
      const imageUrl = this.scenarioPath + "/" + expression.file;

      loadPromises.push(this._lazyLoadImage(imageName, imageUrl));
    }

    const outfit = characterConfig.outfits.find((o) => o.id === outfitId);
    if (!outfit) {
      throw new ScriptError(
        `Outfit not found for character ${characterId}: ${outfitId}`,
      );
    }

    const expression = characterConfig.expressions.find(
      (e) => e.id === expressionId,
    );
    if (!expression) {
      throw new ScriptError(
        `Expression not found for character ${characterId}: ${expressionId}`,
      );
    }

    this._busy = Promise.all(loadPromises).then(() => {});
    await this._busy;

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
      throw new ScriptError(`Character not on scene: ${characterId}`);
    }

    const characterConfig =
      this.scenario.characters.find((c) => c.id === characterId) ||
      throwError(`Character not found`, { characterId });

    const outfit = characterConfig.outfits.find((o) => o.id === outfitId);
    if (!outfit) {
      throw new ScriptError(
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
      throw new ScriptError(`Character not on scene: ${characterId}`);
    }

    const characterConfig =
      this.scenario.characters.find((c) => c.id === characterId) ||
      throwError(`Character not found`, { characterId });

    const expression = characterConfig.expressions.find(
      (e) => e.id === expressionId,
    );
    if (!expression) {
      throw new ScriptError(
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

  private async _lazyLoadImage(name: string, url: string): Promise<void> {
    if (
      this.loader.keyExists(
        new Phaser.Loader.File(this.loader, {
          key: name,
          type: "image",
        }),
      )
    ) {
      console.debug("Image already loaded", name);
      return;
    }

    const deferred = new Deferred<void>();

    this.loader.image(name, url);
    this.loader.once(Phaser.Loader.Events.COMPLETE, () => deferred.resolve());
    this.loader.start();

    return deferred.promise;
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

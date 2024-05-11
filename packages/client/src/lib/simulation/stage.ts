import { LuaEngine, LuaFactory } from "wasmoon";
import { Scenario } from "../types";
import { Scene } from "./scene";

/**
 * A Lua script error.
 */
export class StageScriptError extends Error {}

export type StageDto = {
  scene: {
    locationId: string;
    sceneId: string;
  };

  characters: {
    id: string;
    outfitId: string;
    expressionId: string;
  }[];
};

/**
 * An abstract simulation stage object.
 */
export class Stage {
  scene?: {
    locationId: string;
    sceneId: string;
  };

  characters: {
    id: string;
    outfitId: string;
    expressionId: string;
  }[] = [];

  private _lua?: LuaEngine;
  private _connectedScene?: Scene;

  constructor(
    readonly scenario: Scenario,
    initialStage?: StageDto,
  ) {
    if (initialStage) {
      this.scene = initialStage.scene;
      this.characters = initialStage.characters;
    }
  }

  dump(): StageDto {
    return {
      scene: this.scene!,
      characters: this.characters,
    };
  }

  async init() {
    this._lua = await new LuaFactory().createEngine().then((lua) => {
      lua.global.set("noop", () => {});

      lua.global.set("set_scene", (sceneId: string, clear: boolean) => {
        this.setScene(sceneId, clear);
      });

      lua.global.set(
        "add_character",
        (characterId: string, outfitId: string, expressionId: string) => {
          this.addCharacter(characterId, outfitId, expressionId);
        },
      );

      lua.global.set("set_outfit", (characterId: string, outfitId: string) => {
        this.setOutfit(characterId, outfitId);
      });

      lua.global.set(
        "set_expression",
        (characterId: string, expressionId: string) => {
          this.setExpression(characterId, expressionId);
        },
      );

      lua.global.set("remove_character", (characterId: string) => {
        this.removeCharacter(characterId);
      });

      return lua;
    });
  }

  connectScene(scene: Scene) {
    this._connectedScene = scene;
  }

  eval(luaCode: string): Promise<any> {
    if (!this._lua) throw new Error("Lua engine not initialized");
    return this._lua.doString(luaCode);
  }

  private setScene(id: string, clear: boolean) {
    const [locationId, sceneId] = id.split("/");

    const location = this.scenario.locations.find((l) => l.id === locationId);
    if (!location)
      throw new StageScriptError(`Location not found: ${locationId}`);

    const scene = location.scenes.find((s) => s.id === sceneId);
    if (!scene) throw new StageScriptError(`Scene not found: ${sceneId}`);

    this.scene = { locationId, sceneId };

    if (clear) {
      this.characters = [];
    }

    this._connectedScene?.setScene(id, clear);
  }

  private addCharacter(
    characterId: string,
    outfitId: string,
    expressionId: string,
  ) {
    const character = this.scenario.characters.find(
      (c) => c.id === characterId,
    );
    if (!character)
      throw new StageScriptError(`Character not found: ${characterId}`);

    if (this.characters.find((c) => c.id === characterId)) {
      throw new StageScriptError(`Character already on stage: ${characterId}`);
    }

    const outfit = character.outfits.find((o) => o.id === outfitId);
    if (!outfit) {
      throw new StageScriptError(
        `Outfit not found for character ${characterId}: ${outfitId}`,
      );
    }

    const expression = character.expressions.find((e) => e.id === expressionId);
    if (!expression) {
      throw new StageScriptError(
        `Expression not found for character ${characterId}: ${expressionId}`,
      );
    }

    this.characters.push({ id: characterId, outfitId, expressionId });
    this._connectedScene?.addCharacter(characterId, outfitId, expressionId);
  }

  private setOutfit(characterId: string, outfitId: string) {
    const character = this.characters.find((c) => c.id === characterId);
    if (!character) {
      throw new StageScriptError(`Character not on stage: ${characterId}`);
    }

    const outfit = this.scenario.characters
      .find((c) => c.id === characterId)
      ?.outfits.find((o) => o.id === outfitId);

    if (!outfit) {
      throw new StageScriptError(
        `Outfit not found for character ${characterId}: ${outfitId}`,
      );
    }

    character.outfitId = outfitId;

    this._connectedScene?.setOutfit(characterId, outfitId);
  }

  private setExpression(characterId: string, expressionId: string) {
    const character = this.characters.find((c) => c.id === characterId);
    if (!character) {
      throw new StageScriptError(`Character not on stage: ${characterId}`);
    }

    const expression = this.scenario.characters
      .find((c) => c.id === characterId)
      ?.expressions.find((e) => e.id === expressionId);

    if (!expression) {
      throw new StageScriptError(
        `Expression not found for character ${characterId}: ${expressionId}`,
      );
    }

    character.expressionId = expressionId;

    this._connectedScene?.setExpression(characterId, expressionId);
  }

  private removeCharacter(characterId: string) {
    const index = this.characters.findIndex((c) => c.id === characterId);

    if (index === -1) {
      throw new StageScriptError(`Character not on stage: ${characterId}`);
    }

    this.characters.splice(index, 1);

    this._connectedScene?.removeCharacter(characterId);
  }
}

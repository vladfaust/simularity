import { LuaEngine, LuaFactory } from "wasmoon";
import { DirectorUpdateCode } from "../ai/director";
import { Scenario } from "../types";
import { clone } from "../utils";
import { Scene } from "./scene";

/**
 * A stage script error.
 */
export class StageScriptError extends Error {}

/**
 * A stage state.
 */
export type State = {
  sceneQualifiedId?: string;

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
  sceneQualifiedId?: string;

  characters: {
    id: string;
    outfitId: string;
    expressionId: string;
  }[] = [];

  private _lua?: LuaEngine;
  private _connectedScene?: Scene;
  private _directorUpdateCode: DirectorUpdateCode = [];

  constructor(readonly scenario: Scenario) {}

  dump(): State {
    return clone<State>({
      sceneQualifiedId: this.sceneQualifiedId,
      characters: this.characters,
    });
  }

  async initCodeEngine() {
    this._lua = await new LuaFactory().createEngine().then((lua) => {
      lua.global.set("noop", () => {});

      lua.global.set(
        "set_scene",
        (sceneQualifiedId: string, clear: boolean) => {
          this.setScene(sceneQualifiedId, clear);
          this._directorUpdateCode.push({
            name: "set_scene",
            args: {
              sceneId: sceneQualifiedId,
              clear,
            },
          });
        },
      );

      lua.global.set(
        "add_character",
        (characterId: string, outfitId: string, expressionId: string) => {
          this.addCharacter(characterId, outfitId, expressionId);
          this._directorUpdateCode.push({
            name: "add_character",
            args: {
              characterId,
              outfitId,
              expressionId,
            },
          });
        },
      );

      lua.global.set("set_outfit", (characterId: string, outfitId: string) => {
        this.setOutfit(characterId, outfitId);
        this._directorUpdateCode.push({
          name: "set_outfit",
          args: {
            characterId,
            outfitId,
          },
        });
      });

      lua.global.set(
        "set_expression",
        (characterId: string, expressionId: string) => {
          this.setExpression(characterId, expressionId);
          this._directorUpdateCode.push({
            name: "set_expression",
            args: {
              characterId,
              expressionId,
            },
          });
        },
      );

      lua.global.set("remove_character", (characterId: string) => {
        this.removeCharacter(characterId);
        this._directorUpdateCode.push({
          name: "remove_character",
          args: {
            characterId,
          },
        });
      });

      return lua;
    });
  }

  connectScene(scene: Scene) {
    this._connectedScene = scene;
  }

  async eval(luaCode: string): Promise<DirectorUpdateCode> {
    if (!this._lua) throw new Error("Lua engine not initialized");
    this._directorUpdateCode.length = 0;
    await this._lua.doString(luaCode);
    return this._directorUpdateCode;
  }

  /**
   * Reset the stage immediately to the given state.
   */
  set(state: State | null = null) {
    state = clone(state);
    this.sceneQualifiedId = state?.sceneQualifiedId;
    this.characters = state?.characters ?? [];
    this._connectedScene?.set(state);
  }

  private setScene(qualifiedId: string, clear: boolean) {
    const [locationId, sceneId] = qualifiedId.split("/");

    const location = this.scenario.locations.find((l) => l.id === locationId);
    if (!location)
      throw new StageScriptError(`Location not found: ${locationId}`);

    const scene = location.scenes.find((s) => s.id === sceneId);
    if (!scene) throw new StageScriptError(`Scene not found: ${sceneId}`);

    this.sceneQualifiedId = qualifiedId;

    if (clear) {
      this.characters = [];
    }

    this._connectedScene?.setScene(qualifiedId, clear);
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

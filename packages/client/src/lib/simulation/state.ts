import { deepEqual } from "fast-equals";
import { computed, readonly, ref } from "vue";
import { LuaEngine, LuaFactory } from "wasmoon";
import { clone, unreachable } from "../utils";
import {
  Scenario,
  findCharacter,
  findEpisode,
  findExpression,
  findLocation,
  findOutfit,
  findScene,
} from "./scenario";
import { StageRenderer } from "./stageRenderer";
import { StateCommand, stateCommandsToCode } from "./state/commands";

export class StateError extends Error {}

/**
 * A stage state.
 */
export type Stage = {
  scene: {
    locationId: string;
    sceneId: string;
  } | null;

  characters: {
    id: string;
    outfitId: string;
    expressionId: string;
  }[];
};

/**
 * A Data Transfer Object (DTO) for a simulation state.
 */
export type StateDto = {
  stage: Stage;
  currentEpisode?: {
    id: string;
    totalChunks: number;
    nextChunkIndex: number;
  } | null;
  day?: number;
  timeOfDay?: "morning" | "day" | "evening" | "night";
};

/**
 * A simulation state object.
 */
export class State {
  private readonly _stage = ref<Stage>({
    scene: null,
    characters: [],
  });
  readonly stage = readonly(this._stage);

  private readonly _currentEpisode = ref<
    | (Scenario["episodes"][0] & {
        id: string;
        nextChunkIndex: number;
        totalChunks: number;
      })
    | null
  >(null);

  /**
   * Will be set since a preceding non-episode update,
   * and until the last episode chunk, inclusive.
   */
  readonly currentEpisode = readonly(this._currentEpisode);

  /**
   * Whether the current episode shall advance to the next chunk.
   * If false, the episode is already at its last chunk.
   */
  readonly shallAdvanceEpisode = computed<boolean | undefined>(() => {
    return this._currentEpisode.value
      ? this._currentEpisode.value.nextChunkIndex <
          this._currentEpisode.value.chunks.length
      : undefined;
  });

  private _lua?: LuaEngine;
  private _connectedRenderer?: StageRenderer;
  private _recentCalls: StateCommand[] = [];

  constructor(readonly scenario: Scenario) {}

  /**
   * Serialize the state to a DTO.
   * @returns A deep clone of the state.
   */
  serialize(): StateDto {
    return {
      stage: clone(this._stage.value),
      currentEpisode: this._currentEpisode.value
        ? {
            id: this._currentEpisode.value.id,
            nextChunkIndex: this._currentEpisode.value.nextChunkIndex,
            totalChunks: this._currentEpisode.value.chunks.length,
          }
        : null,
    };
  }

  /**
   * Deserialize a state from a DTO.
   */
  static deserialize(dto: StateDto, scenario: Scenario): State {
    const state = new State(scenario);
    state._stage.value = clone(dto.stage);

    if (dto.currentEpisode) {
      const currentEpisode = findEpisode(scenario, dto.currentEpisode.id);

      if (!currentEpisode) {
        throw new StateError(`Episode not found: ${dto.currentEpisode!.id}`);
      }

      state._currentEpisode.value = {
        ...currentEpisode,
        id: dto.currentEpisode.id,
        nextChunkIndex: dto.currentEpisode.nextChunkIndex,
        totalChunks: currentEpisode.chunks.length,
      };
    }

    return state;
  }

  /**
   * Return a delta of this state compared to another state DTO.
   * For example, if current state has a character that the other state
   * does not, the delta will include an `"add_character"` call.
   */
  delta(otherState: StateDto | null | undefined): StateCommand[] {
    const delta: StateCommand[] = [];
    let clear = false;

    if (
      this._stage.value.scene?.locationId !==
        otherState?.stage.scene?.locationId ||
      this._stage.value.scene?.sceneId !== otherState?.stage.scene?.sceneId
    ) {
      clear = this._stage.value.characters.length === 0;

      delta.push({
        name: "set_scene",
        args: {
          sceneId: this._stage.value.scene
            ? toSceneQualifiedId(
                this._stage.value.scene.locationId,
                this._stage.value.scene.sceneId,
              )
            : null,
          clear,
        },
      });
    }

    for (const character of this._stage.value.characters) {
      const otherCharacter = otherState?.stage.characters.find(
        (c) => c.id === character.id,
      );

      if (!otherCharacter) {
        delta.push({
          name: "add_character",
          args: {
            characterId: character.id,
            outfitId: character.outfitId,
            expressionId: character.expressionId,
          },
        });
      } else {
        if (character.outfitId !== otherCharacter.outfitId) {
          delta.push({
            name: "set_outfit",
            args: {
              characterId: character.id,
              outfitId: character.outfitId,
            },
          });
        }

        if (character.expressionId !== otherCharacter.expressionId) {
          delta.push({
            name: "set_expression",
            args: {
              characterId: character.id,
              expressionId: character.expressionId,
            },
          });
        }
      }
    }

    if (!clear && otherState?.stage.characters) {
      for (const character of otherState.stage.characters) {
        if (!this._stage.value.characters.find((c) => c.id === character.id)) {
          delta.push({
            name: "remove_character",
            args: {
              characterId: character.id,
            },
          });
        }
      }
    }

    return delta;
  }

  // REFACTOR: Move Lua logic outside.
  async initCodeEngine() {
    this._lua = await new LuaFactory().createEngine().then((lua) => {
      lua.global.set("noop", () => {});

      lua.global.set(
        "set_scene",
        (sceneQualifiedId: string, clear: boolean) => {
          this.setScene(sceneQualifiedId, clear);
          this._recentCalls.push({
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
          this._recentCalls.push({
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
        this._recentCalls.push({
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
          this._recentCalls.push({
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
        this._recentCalls.push({
          name: "remove_character",
          args: {
            characterId,
          },
        });
      });

      return lua;
    });
  }

  /**
   * Connect a stage renderer to the state.
   * Would set the renderer to the current stage.
   */
  connectStageRenderer(scene: StageRenderer) {
    this._connectedRenderer = scene;
    // this._connectedRenderer.setStage(this._stage.value);
  }

  /**
   * Evaluate Lua code, returning the list of stage calls made.
   */
  async eval(code: string): Promise<StateCommand[]> {
    if (!this._lua) throw new Error("Code engine not initialized");
    this._recentCalls.length = 0;
    await this._lua.doString(code);
    return this._recentCalls;
  }

  /**
   * Apply a list of state commands to the state.
   */
  apply(commands: Readonly<StateCommand[]>) {
    for (const cmd of commands) {
      switch (cmd.name) {
        case "set_scene":
          this.setScene(cmd.args.sceneId, cmd.args.clear);
          break;
        case "add_character":
          this.addCharacter(
            cmd.args.characterId,
            cmd.args.outfitId,
            cmd.args.expressionId,
          );
          break;
        case "set_outfit":
          this.setOutfit(cmd.args.characterId, cmd.args.outfitId);
          break;
        case "set_expression":
          this.setExpression(cmd.args.characterId, cmd.args.expressionId);
          break;
        case "remove_character":
          this.removeCharacter(cmd.args.characterId);
          break;
        default:
          throw unreachable(cmd);
      }
    }
  }

  /**
   * Reset the stage immediately to the given state.
   */
  setState(state: StateDto | null) {
    state = clone(state);
    this._stage.value.scene = state?.stage.scene || null;
    this._stage.value.characters = state?.stage.characters || [];
    this._connectedRenderer?.setStage(state?.stage || null);
  }

  /**
   * Set the current episode, but do not advance it.
   */
  setEpisode(episodeId: string, nextChunkIndex = 0) {
    const found = findEpisode(this.scenario, episodeId);
    if (!found) throw new StateError(`Episode not found: ${episodeId}`);

    this._currentEpisode.value = {
      ...found,
      id: episodeId,
      nextChunkIndex,
      totalChunks: found.chunks.length,
    };
  }

  /**
   * Advance the current episode to the next chunk.
   *
   * @assert The current episode is set.
   * @assert The current episode has more chunks.
   *
   * @returns The applied chunk data.
   */
  async advanceCurrentEpisode() {
    const currentEpisode = this._currentEpisode.value;

    if (!currentEpisode) {
      throw new StateError("No current episode to advance");
    }

    const chunkIndex = currentEpisode.nextChunkIndex;

    if (chunkIndex >= currentEpisode.chunks.length) {
      throw new StateError("No more chunks to advance");
    }

    console.debug("Advancing episode", currentEpisode);
    const { characterId, text, code } = currentEpisode.chunks[chunkIndex];

    if (code?.length) {
      console.debug("Applying stage code", stateCommandsToCode(code));
      this.apply(code);
      // TODO: if (scene.busy) await scene.busy;
    }

    return {
      episodeId: currentEpisode.id,
      chunkIndex: currentEpisode.nextChunkIndex++,
      characterId,
      text,
      code,
    };
  }

  setScene(qualifiedId: string | null, clear: boolean) {
    if (qualifiedId) {
      const { locationId, sceneId } = parseQualifiedSceneId(qualifiedId);

      const location = findLocation(this.scenario, locationId);
      if (!location) throw new StateError(`Location not found: ${locationId}`);

      const scene = findScene(location, sceneId);
      if (!scene) throw new StateError(`Scene not found: ${sceneId}`);

      this._stage.value.scene = { locationId, sceneId };
    }

    if (clear) {
      this._stage.value.characters = [];
    }

    this._connectedRenderer?.setScene(qualifiedId, clear);
  }

  addCharacter(characterId: string, outfitId: string, expressionId: string) {
    const character = findCharacter(this.scenario, characterId);
    if (!character) throw new StateError(`Character not found: ${characterId}`);

    if (this._stage.value.characters.find((c) => c.id === characterId)) {
      throw new StateError(`Character already on stage: ${characterId}`);
    }

    const outfit = findOutfit(character, outfitId);
    if (!outfit) {
      throw new StateError(
        `Outfit not found for character ${characterId}: ${outfitId}`,
      );
    }

    const expression = findExpression(character, expressionId);
    if (!expression) {
      throw new StateError(
        `Expression not found for character ${characterId}: ${expressionId}`,
      );
    }

    this._stage.value.characters.push({
      id: characterId,
      outfitId,
      expressionId,
    });
    this._connectedRenderer?.addCharacter(characterId, outfitId, expressionId);
  }

  setOutfit(characterId: string, outfitId: string) {
    const character = this._stage.value.characters.find(
      (c) => c.id === characterId,
    );
    if (!character) {
      throw new StateError(`Character not on stage: ${characterId}`);
    }

    const scenarioCharacter = findCharacter(this.scenario, characterId);
    if (!scenarioCharacter) {
      throw new StateError(`Character not found in scenario: ${characterId}`);
    }

    const outfit = findOutfit(scenarioCharacter, outfitId);
    if (!outfit) {
      throw new StateError(
        `Outfit not found for character ${characterId}: ${outfitId}`,
      );
    }

    character.outfitId = outfitId;

    this._connectedRenderer?.setOutfit(characterId, outfitId);
  }

  setExpression(characterId: string, expressionId: string) {
    const character = this._stage.value.characters.find(
      (c) => c.id === characterId,
    );
    if (!character) {
      throw new StateError(`Character not on stage: ${characterId}`);
    }

    const scenarioCharacter = findCharacter(this.scenario, characterId);
    if (!scenarioCharacter) {
      throw new StateError(`Character not found in scenario: ${characterId}`);
    }

    const expression = findExpression(scenarioCharacter, expressionId);
    if (!expression) {
      throw new StateError(
        `Expression not found for character ${characterId}: ${expressionId}`,
      );
    }

    character.expressionId = expressionId;

    this._connectedRenderer?.setExpression(characterId, expressionId);
  }

  removeCharacter(characterId: string) {
    const index = this._stage.value.characters.findIndex(
      (c) => c.id === characterId,
    );

    if (index === -1) {
      throw new StateError(`Character not on stage: ${characterId}`);
    }

    this._stage.value.characters.splice(index, 1);

    this._connectedRenderer?.removeCharacter(characterId);
  }
}

/**
 * Convert a location ID and scene ID to a fully qualified scene ID.
 * @example toSceneQualifiedId("location1", "scene1") // => "location1/scene1"
 */
export function toSceneQualifiedId(
  locationId: string,
  sceneId: string,
): string {
  return `${locationId}/${sceneId}`;
}

/**
 * Parse a fully qualified scene ID to location ID and scene ID.
 * @example parseQualifiedSceneId("location1/scene1")
 * // => { locationId: "location1", sceneId: "scene1" }
 */
export function parseQualifiedSceneId(qualifiedId: string): {
  locationId: string;
  sceneId: string;
} {
  const [locationId, sceneId] = qualifiedId.split("/");
  return { locationId, sceneId };
}

export function emptyStateDto(): StateDto {
  return {
    stage: {
      scene: null,
      characters: [],
    },
    currentEpisode: null,
  };
}

/**
 * Apply commands to a state DTO without any checks, used to compare results.
 * It would throw, however, if, for example, a character
 * to change outfit or expression is not on the stage.
 */
function applyCommandsToStateDtoUnsafe(
  state: StateDto | null,
  commands: StateCommand[],
): StateDto {
  state = state || emptyStateDto();

  for (const cmd of commands) {
    switch (cmd.name) {
      case "set_scene": {
        state.stage.scene = cmd.args.sceneId
          ? parseQualifiedSceneId(cmd.args.sceneId)
          : null;

        if (cmd.args.clear) {
          state.stage.characters = [];
        }

        break;
      }

      case "add_character": {
        state.stage.characters.push({
          id: cmd.args.characterId,
          outfitId: cmd.args.outfitId,
          expressionId: cmd.args.expressionId,
        });

        state.stage.characters.sort((a, b) => a.id.localeCompare(b.id));

        break;
      }

      case "set_outfit": {
        state.stage.characters.find(
          (c) => c.id === cmd.args.characterId,
        )!.outfitId = cmd.args.outfitId;

        break;
      }

      case "set_expression": {
        state.stage.characters.find(
          (c) => c.id === cmd.args.characterId,
        )!.expressionId = cmd.args.expressionId;

        break;
      }

      case "remove_character": {
        state.stage.characters = state.stage.characters.filter(
          (c) => c.id !== cmd.args.characterId,
        );

        break;
      }

      default:
        throw unreachable(cmd);
    }
  }

  return state;
}

/**
 * Compare two state command lists and return whether
 * — if applied to `base` — they result in equivalent states.
 */
export function comparesStateDeltas(
  base: StateDto | null,
  commandsA: StateCommand[],
  commandsB: StateCommand[],
): boolean {
  const stateA = applyCommandsToStateDtoUnsafe(base, commandsA);
  const stateB = applyCommandsToStateDtoUnsafe(base, commandsB);
  return deepEqual(stateA, stateB);
}

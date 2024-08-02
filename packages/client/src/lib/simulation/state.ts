import { deepEqual } from "fast-equals";
import { computed, readonly, ref } from "vue";
import { LuaEngine, LuaFactory } from "wasmoon";
import { clone, unreachable } from "../utils";
import { Scenario } from "./scenario";
import { StageRenderer } from "./stageRenderer";
import { StateCommand, stateCommandsToCodeLines } from "./state/commands";

/**
 * When a Lua code has semantic error, such as missing arguments.
 */
export class EngineCodeSemanticError extends Error {}

/**
 * When state encounters a logical error, such as
 * trying to remove a non-existing character.
 */
export class StateError extends Error {}

/**
 * A stage state.
 */
export type Stage = {
  sceneId: string | null;

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
  private readonly _stage = ref<Stage>({ sceneId: null, characters: [] });
  readonly stage = readonly(this._stage);

  private readonly _currentEpisode = ref<
    | (Scenario["content"]["episodes"][0] & {
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
      const currentEpisode = scenario.ensureEpisode(dto.currentEpisode.id);

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

    if (this._stage.value.sceneId !== otherState?.stage.sceneId) {
      clear = this._stage.value.characters.length === 0;

      delta.push({
        name: "setScene",
        args: {
          sceneId: this._stage.value.sceneId,
          clearStage: clear,
        },
      });
    }

    for (const character of this._stage.value.characters) {
      const otherCharacter = otherState?.stage.characters.find(
        (c) => c.id === character.id,
      );

      if (!otherCharacter) {
        delta.push({
          name: "addCharacter",
          args: {
            characterId: character.id,
            outfitId: character.outfitId,
            expressionId: character.expressionId,
          },
        });
      } else {
        if (character.outfitId !== otherCharacter.outfitId) {
          delta.push({
            name: "setCharacterOutfit",
            args: {
              characterId: character.id,
              outfitId: character.outfitId,
            },
          });
        }

        if (character.expressionId !== otherCharacter.expressionId) {
          delta.push({
            name: "setCharacterExpression",
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
            name: "removeCharacter",
            args: {
              characterId: character.id,
            },
          });
        }
      }
    }

    return delta;
  }

  static async createLuaEngine(ctx: {
    setScene: (sceneId: string, clearScene: boolean) => void;
    addCharacter: (
      characterId: string,
      outfitId: string,
      expressionId: string,
    ) => void;
    removeCharacter: (characterId: string) => void;
    setCharacterOutfit: (characterId: string, outfitId: string) => void;
    setCharacterExpression: (characterId: string, expressionId: string) => void;
  }): Promise<LuaEngine> {
    return new LuaFactory().createEngine().then((lua) => {
      // Set the current scene.
      lua.global.set(
        "setScene",
        (args: { sceneId?: string; clearScene?: boolean }) => {
          if (!args.sceneId) {
            throw new EngineCodeSemanticError("Missing argument: sceneId");
          }

          if (args.clearScene === undefined) {
            throw new EngineCodeSemanticError("Missing argument: clear");
          }

          ctx.setScene(args.sceneId, args.clearScene);
        },
      );

      // Add a character to the stage.
      lua.global.set(
        "addCharacter",
        (args: {
          characterId?: string;
          outfitId?: string;
          expressionId?: string;
        }) => {
          if (!args.characterId) {
            throw new EngineCodeSemanticError("Missing argument: characterId");
          }

          if (!args.outfitId) {
            throw new EngineCodeSemanticError("Missing argument: outfitId");
          }

          if (!args.expressionId) {
            throw new EngineCodeSemanticError("Missing argument: expressionId");
          }

          ctx.addCharacter(args.characterId, args.outfitId, args.expressionId);
        },
      );

      // Set the outfit of a character.
      lua.global.set(
        "setCharacterOutfit",
        (args: { characterId?: string; outfitId?: string }) => {
          if (!args.characterId) {
            throw new EngineCodeSemanticError("Missing argument: characterId");
          }

          if (!args.outfitId) {
            throw new EngineCodeSemanticError("Missing argument: outfitId");
          }

          ctx.setCharacterOutfit(args.characterId, args.outfitId);
        },
      );

      // Set expression of a character.
      lua.global.set(
        "setCharacterExpression",
        (args: { characterId?: string; expressionId?: string }) => {
          if (!args.characterId) {
            throw new EngineCodeSemanticError("Missing argument: characterId");
          }

          if (!args.expressionId) {
            throw new EngineCodeSemanticError("Missing argument: expressionId");
          }

          ctx.setCharacterExpression(args.characterId, args.expressionId);
        },
      );

      // Remove a character from the stage.
      lua.global.set("removeCharacter", (args: { characterId?: string }) => {
        if (!args.characterId) {
          throw new EngineCodeSemanticError("Missing argument: characterId");
        }

        ctx.removeCharacter(args.characterId);
      });

      return lua;
    });
  }

  async initCodeEngine() {
    this._lua = await State.createLuaEngine({
      setScene: (sceneId, clearScene) => {
        this.setScene(sceneId, clearScene);
        this._recentCalls.push({
          name: "setScene",
          args: {
            sceneId,
            clearStage: clearScene,
          },
        });
      },
      addCharacter: (characterId, outfitId, expressionId) => {
        this.addCharacter(characterId, outfitId, expressionId);
        this._recentCalls.push({
          name: "addCharacter",
          args: {
            characterId,
            outfitId,
            expressionId,
          },
        });
      },
      setCharacterOutfit: (characterId, outfitId) => {
        this.setCharacterOutfit(characterId, outfitId);
        this._recentCalls.push({
          name: "setCharacterOutfit",
          args: {
            characterId,
            outfitId,
          },
        });
      },
      setCharacterExpression: (characterId, expressionId) => {
        this.setCharacterExpression(characterId, expressionId);
        this._recentCalls.push({
          name: "setCharacterExpression",
          args: {
            characterId,
            expressionId,
          },
        });
      },
      removeCharacter: (characterId) => {
        this.removeCharacter(characterId);
        this._recentCalls.push({
          name: "removeCharacter",
          args: {
            characterId,
          },
        });
      },
    });
  }

  /**
   * Connect a stage renderer to the state.
   */
  connectStageRenderer(scene: StageRenderer) {
    this._connectedRenderer = scene;
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
        case "setScene":
          this.setScene(cmd.args.sceneId, cmd.args.clearStage);
          break;
        case "addCharacter":
          this.addCharacter(
            cmd.args.characterId,
            cmd.args.outfitId,
            cmd.args.expressionId,
          );
          break;
        case "setCharacterOutfit":
          this.setCharacterOutfit(cmd.args.characterId, cmd.args.outfitId);
          break;
        case "setCharacterExpression":
          this.setCharacterExpression(
            cmd.args.characterId,
            cmd.args.expressionId,
          );
          break;
        case "removeCharacter":
          this.removeCharacter(cmd.args.characterId);
          break;
        default:
          throw new StateError(`Unknown command: ${JSON.stringify(cmd)}`);
      }
    }
  }

  /**
   * Reset the stage immediately to the given state.
   */
  setState(state: StateDto | null) {
    state = clone(state);
    this._stage.value.sceneId =
      state?.stage.sceneId || this.scenario.defaultSceneId;
    this._stage.value.characters = state?.stage.characters || [];
    this._connectedRenderer?.setStage(state?.stage || null);
  }

  /**
   * Set the current episode, but do not advance it.
   */
  setEpisode(episodeId: string, nextChunkIndex = 0) {
    const found = this.scenario.findEpisode(episodeId);
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
    const { writerUpdate, directorUpdate } = currentEpisode.chunks[chunkIndex];

    if (directorUpdate?.length) {
      console.debug(
        "Applying stage code",
        stateCommandsToCodeLines(directorUpdate),
      );
      this.apply(directorUpdate);
      // TODO: if (scene.busy) await scene.busy;
    }

    return {
      episodeId: currentEpisode.id,
      chunkIndex: currentEpisode.nextChunkIndex++,
      writerUpdate,
      directorUpdate,
    };
  }

  setScene(sceneId: string | null, clear: boolean) {
    if (sceneId) {
      const scene = this.scenario.findEpisode(sceneId);
      if (!scene) throw new StateError(`Scene not found: ${sceneId}`);
      this._stage.value.sceneId = sceneId;
    } else {
      this._stage.value.sceneId = null;
    }

    if (clear) {
      this._stage.value.characters = [];
    }

    this._connectedRenderer?.setScene(sceneId, clear);
  }

  addCharacter(characterId: string, outfitId: string, expressionId: string) {
    const character = this.scenario.findCharacter(characterId);
    if (!character) throw new StateError(`Character not found: ${characterId}`);

    if (this._stage.value.characters.find((c) => c.id === characterId)) {
      throw new StateError(`Character already on stage: ${characterId}`);
    }

    const outfit = this.scenario.findOutfit(characterId, outfitId);
    if (!outfit) {
      throw new StateError(
        `Outfit not found for character ${characterId}: ${outfitId}`,
      );
    }

    const expression = this.scenario.findExpression(characterId, expressionId);
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

  setCharacterOutfit(characterId: string, outfitId: string) {
    const character = this._stage.value.characters.find(
      (c) => c.id === characterId,
    );
    if (!character) {
      throw new StateError(`Character not on stage: ${characterId}`);
    }

    const scenarioCharacter = this.scenario.findCharacter(characterId);
    if (!scenarioCharacter) {
      throw new StateError(`Character not found in scenario: ${characterId}`);
    }

    const outfit = this.scenario.findOutfit(characterId, outfitId);
    if (!outfit) {
      throw new StateError(
        `Outfit not found for character ${characterId}: ${outfitId}`,
      );
    }

    character.outfitId = outfitId;

    this._connectedRenderer?.setCharacterOutfit(characterId, outfitId);
  }

  setCharacterExpression(characterId: string, expressionId: string) {
    const character = this._stage.value.characters.find(
      (c) => c.id === characterId,
    );
    if (!character) {
      throw new StateError(`Character not on stage: ${characterId}`);
    }

    const scenarioCharacter = this.scenario.findCharacter(characterId);
    if (!scenarioCharacter) {
      throw new StateError(`Character not found in scenario: ${characterId}`);
    }

    const expression = this.scenario.findExpression(characterId, expressionId);
    if (!expression) {
      throw new StateError(
        `Expression not found for character ${characterId}: ${expressionId}`,
      );
    }

    character.expressionId = expressionId;

    this._connectedRenderer?.setCharacterExpression(characterId, expressionId);
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

export function emptyStateDto(): StateDto {
  return {
    stage: {
      sceneId: null,
      characters: [],
    },
    currentEpisode: null,
  };
}

/**
 * Apply commands to a state DTO without any checks, used to compare results.
 */
function applyCommandsToStateDtoUnsafe(
  state: StateDto | null,
  commands: StateCommand[],
): StateDto {
  state = state || emptyStateDto();

  for (const cmd of commands) {
    switch (cmd.name) {
      case "setScene": {
        state.stage.sceneId = cmd.args.sceneId;

        if (cmd.args.clearStage) {
          state.stage.characters = [];
        }

        break;
      }

      case "addCharacter": {
        state.stage.characters.push({
          id: cmd.args.characterId,
          outfitId: cmd.args.outfitId,
          expressionId: cmd.args.expressionId,
        });

        state.stage.characters.sort((a, b) => a.id.localeCompare(b.id));

        break;
      }

      case "setCharacterOutfit": {
        state.stage.characters.find(
          (c) => c.id === cmd.args.characterId,
        )!.outfitId = cmd.args.outfitId;

        break;
      }

      case "setCharacterExpression": {
        state.stage.characters.find(
          (c) => c.id === cmd.args.characterId,
        )!.expressionId = cmd.args.expressionId;

        break;
      }

      case "removeCharacter": {
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

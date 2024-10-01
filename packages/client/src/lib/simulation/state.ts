import type { ImmersiveScenario } from "@/lib/scenario";
import { deepEqual } from "fast-equals";
import { readonly, ref, type Ref } from "vue";
import { clone, unreachable } from "../utils";
import { type StageRenderer } from "./stageRenderer";
import { type StateCommand } from "./state/commands";

/**
 * When state encounters a logical error, such as
 * trying to remove a non-existing character.
 */
export class StateError extends Error {}

/**
 * A stage state.
 */
export type Stage = {
  /**
   * The ID of the current scene.
   */
  sceneId: string;

  characters: {
    id: string;

    /**
     * The ID of the current outfit.
     */
    outfitId: string;

    /**
     * The ID of the current expression.
     */
    expressionId: string;
  }[];
};

/**
 * A Data Transfer Object (DTO) for a simulation state.
 * NOTE: Be careful when using this object, as it is mutable.
 * Use `clone` to create a deep copy.
 */
export type StateDto = {
  stage: Stage;
};

/**
 * A simulation state object.
 */
export class State {
  private readonly _stage: Ref<Stage> = ref({ sceneId: "", characters: [] });
  readonly stage = readonly(this._stage);

  private _connectedRenderer?: StageRenderer;

  constructor(
    readonly scenario: ImmersiveScenario,
    dto?: StateDto,
  ) {
    if (dto) {
      this._stage = ref(clone(dto.stage));
    }
  }

  /**
   * Serialize the state to a DTO.
   * @returns A deep clone of the state.
   */
  serialize(): StateDto {
    return {
      stage: clone(this._stage.value),
    };
  }

  /**
   * Return a delta of state `a` compared to state `b`. For example,
   * if `a` has character that `b` does not, the delta will include
   * an `"add_character"` call.
   */
  static delta(a: Readonly<StateDto>, b?: Readonly<StateDto>): StateCommand[] {
    const delta: StateCommand[] = [];

    if (a.stage.sceneId !== b?.stage.sceneId) {
      delta.push({
        name: "setScene",
        args: {
          sceneId: a.stage.sceneId,
        },
      });
    }

    for (const character of a.stage.characters) {
      const otherCharacter = b?.stage.characters.find(
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
            name: "setOutfit",
            args: {
              characterId: character.id,
              outfitId: character.outfitId,
            },
          });
        }

        if (character.expressionId !== otherCharacter.expressionId) {
          delta.push({
            name: "setExpression",
            args: {
              characterId: character.id,
              expressionId: character.expressionId,
            },
          });
        }
      }
    }

    if (b?.stage.characters) {
      for (const character of b.stage.characters) {
        if (!a.stage.characters.find((c) => c.id === character.id)) {
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

  /**
   * Connect a stage renderer to the state.
   */
  connectStageRenderer(scene: StageRenderer) {
    this._connectedRenderer = scene;
  }

  /**
   * Apply a list of state commands to the state.
   */
  apply(commands: Readonly<StateCommand[]>) {
    for (const cmd of commands) {
      switch (cmd.name) {
        case "setScene":
          this.setScene(cmd.args.sceneId);
          break;
        case "addCharacter":
          this.addCharacter(
            cmd.args.characterId,
            cmd.args.outfitId,
            cmd.args.expressionId,
          );
          break;
        case "setOutfit":
          this.setOutfit(cmd.args.characterId, cmd.args.outfitId);
          break;
        case "setExpression":
          this.setExpression(cmd.args.characterId, cmd.args.expressionId);
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
  setState(state: Readonly<StateDto>) {
    state = clone(state);
    this._stage.value.sceneId = state.stage.sceneId;
    this._stage.value.characters = state.stage.characters ?? [];
    this._connectedRenderer?.setStage(this._stage.value);
  }

  setScene(sceneId: string) {
    const scene = this.scenario.findScene(sceneId);
    if (!scene) throw new StateError(`Scene not found: ${sceneId}`);
    this._stage.value.sceneId = sceneId;
    this._connectedRenderer?.setScene(sceneId);
  }

  addCharacter(characterId: string, outfitId: string, expressionId: string) {
    const character = this.scenario.findCharacter(characterId);
    if (!character) throw new StateError(`Character not found: ${characterId}`);

    if (this._stage.value.characters.find((c) => c.id === characterId)) {
      throw new StateError(`Character already on stage: ${characterId}`);
    }

    if (!this.scenario.findOutfit(characterId, outfitId)) {
      throw new StateError(`Outfit not found for character ${characterId}`);
    }

    if (!this.scenario.findExpression(characterId, expressionId)) {
      throw new StateError(`Expression not found for character ${characterId}`);
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

    if (!this.scenario.findCharacter(characterId)) {
      throw new StateError(`Character not found in scenario: ${characterId}`);
    }

    if (!this.scenario.findOutfit(characterId, outfitId)) {
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

    if (!this.scenario.findCharacter(characterId)) {
      throw new StateError(`Character not found in scenario: ${characterId}`);
    }

    if (!this.scenario.findExpression(characterId, expressionId)) {
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

export function emptyState(): StateDto {
  return {
    stage: { sceneId: "", characters: [] },
  };
}

/**
 * Apply commands to a state DTO without any checks, used to compare results.
 */
export function applyCommandsToStateDtoUnsafe(
  state: StateDto | null,
  commands: Readonly<StateCommand[]>,
): StateDto {
  state = state || emptyState();

  for (const cmd of commands) {
    switch (cmd.name) {
      case "setScene": {
        state.stage.sceneId = cmd.args.sceneId;
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

      case "setOutfit": {
        state.stage.characters.find(
          (c) => c.id === cmd.args.characterId,
        )!.outfitId = cmd.args.outfitId;

        break;
      }

      case "setExpression": {
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
export function compareStateDeltas(
  base: Readonly<StateDto> | null,
  commandsA: Readonly<StateCommand[]>,
  commandsB: Readonly<StateCommand[]>,
): boolean {
  const stateA = applyCommandsToStateDtoUnsafe(clone(base), commandsA);
  const stateB = applyCommandsToStateDtoUnsafe(clone(base), commandsB);
  return deepEqual(stateA, stateB);
}

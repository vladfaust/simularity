import { deepEqual } from "fast-equals";
import { ref } from "vue";
import { LuaEngine, LuaFactory } from "wasmoon";
import { z } from "zod";
import { Scenario } from "../types";
import { clone, unreachable } from "../utils";
import { Scene } from "./scene";

const SetSceneSchema = z
  .object({
    name: z.literal("set_scene"),
    args: z.object({
      sceneId: z
        .string()
        .nullable()
        .describe("A fully qualified ID of the scene to set."),
      clear: z
        .boolean()
        .describe(
          `If "clear" is \`true\`, remove all characters from the scene. If "clear" is \`false\`, keep the characters in the scene and update the scene background only.`,
        ),
    }),
  })
  .describe("Set the scene to specified sceneId.");

const AddCharacterSchema = z
  .object({
    name: z.literal("add_character"),
    args: z.object({
      characterId: z.string().describe("The ID of the character to add."),
      outfitId: z.string().describe("The ID of the outfit to use."),
      expressionId: z.string().describe("The ID of the expression to use."),
    }),
  })
  .describe("Add a character to the scene.");

const SetOutfitSchema = z
  .object({
    name: z.literal("set_outfit"),
    args: z.object({
      characterId: z.string().describe("The ID of the character to update."),
      outfitId: z.string().describe("The ID of the outfit to set."),
    }),
  })
  .describe("Set outfit of a character.");

const SetExpressionSchema = z
  .object({
    name: z.literal("set_expression"),
    args: z.object({
      characterId: z.string().describe("The ID of the character to update."),
      expressionId: z.string().describe("The ID of the expression to set."),
    }),
  })
  .describe("Set expression of a character.");

const RemoveCharacterSchema = z
  .object({
    name: z.literal("remove_character"),
    args: z.object({
      characterId: z.string().describe("The ID of the character to remove."),
    }),
  })
  .describe("Remove a character from the scene.");

export const StageCallSchema = z.union([
  SetSceneSchema,
  AddCharacterSchema,
  SetOutfitSchema,
  SetExpressionSchema,
  RemoveCharacterSchema,
]);

export type StageCall = z.infer<typeof StageCallSchema>;

export function stageCallsToLua(calls: StageCall[]): string {
  return calls
    .map((call) => {
      const args = Object.values(call.args).map((v) => JSON.stringify(v));
      return `${call.name}(${args.join(", ")})`;
    })
    .join("; ");
}

/**
 * A stage function call error.
 */
export class StageCallError extends Error {}

/**
 * A stage state.
 */
export type StageState = {
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

export function toSceneQualifiedId(
  locationId: string,
  sceneId: string,
): string {
  return `${locationId}/${sceneId}`;
}

export function parseQualifiedSceneId(qualifiedId: string): {
  locationId: string;
  sceneId: string;
} {
  const [locationId, sceneId] = qualifiedId.split("/");
  return { locationId, sceneId };
}

function emptyStageState(): StageState {
  return {
    scene: null,
    characters: [],
  };
}

/**
 * Apply calls to a state without scenario checks. It would throw, however,
 * if a character to change outfit or expression is not on the stage.
 */
function applyToStageState(state: StageState, calls: StageCall[]): StageState {
  for (const call of calls) {
    switch (call.name) {
      case "set_scene": {
        state.scene = call.args.sceneId
          ? parseQualifiedSceneId(call.args.sceneId)
          : null;

        if (call.args.clear) {
          state.characters = [];
        }

        break;
      }

      case "add_character": {
        state.characters.push({
          id: call.args.characterId,
          outfitId: call.args.outfitId,
          expressionId: call.args.expressionId,
        });

        state.characters.sort((a, b) => a.id.localeCompare(b.id));

        break;
      }

      case "set_outfit": {
        state.characters.find((c) => c.id === call.args.characterId)!.outfitId =
          call.args.outfitId;

        break;
      }

      case "set_expression": {
        state.characters.find(
          (c) => c.id === call.args.characterId,
        )!.expressionId = call.args.expressionId;

        break;
      }

      case "remove_character": {
        state.characters = state.characters.filter(
          (c) => c.id !== call.args.characterId,
        );

        break;
      }

      default:
        throw unreachable(call);
    }
  }

  return state;
}

/**
 * Compare two stage call lists and return
 * whether they result in the same state.
 */
export function comparesDeltas(
  baseState: StageState | null,
  callsA: StageCall[],
  callsB: StageCall[],
): boolean {
  const stateA = applyToStageState(
    baseState ? clone(baseState) : emptyStageState(),
    callsA,
  );
  const stateB = applyToStageState(
    baseState ? clone(baseState) : emptyStageState(),
    callsB,
  );
  return deepEqual(stateA, stateB);
}

/**
 * An abstract simulation stage object.
 */
export class Stage {
  readonly state = ref<StageState>({
    scene: null,
    characters: [],
  });

  private _lua?: LuaEngine;
  private _connectedScene?: Scene;
  private _recentCalls: StageCall[] = [];

  constructor(readonly scenario: Scenario) {}

  /**
   * Return a delta of the stage state compared to another state.
   * For example, if current state has a character that the other state
   * does not, the delta will include an `"add_character"` call.
   */
  delta(otherState: StageState | undefined | null): StageCall[] {
    const delta: StageCall[] = [];
    let clear = false;

    if (
      this.state.value.scene?.locationId !== otherState?.scene?.locationId ||
      this.state.value.scene?.sceneId !== otherState?.scene?.sceneId
    ) {
      clear = this.state.value.characters.length === 0;

      delta.push({
        name: "set_scene",
        args: {
          sceneId: this.state.value.scene
            ? toSceneQualifiedId(
                this.state.value.scene.locationId,
                this.state.value.scene.sceneId,
              )
            : null,
          clear,
        },
      });
    }

    for (const character of this.state.value.characters) {
      const otherCharacter = otherState?.characters.find(
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

    if (!clear && otherState?.characters) {
      for (const character of otherState.characters) {
        if (!this.state.value.characters.find((c) => c.id === character.id)) {
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

  connectScene(scene: Scene) {
    this._connectedScene = scene;
  }

  /**
   * Evaluate a Lua code, returning the list of stage calls made.
   */
  async eval(luaCode: string): Promise<StageCall[]> {
    if (!this._lua) throw new Error("Lua engine not initialized");
    this._recentCalls.length = 0;
    await this._lua.doString(luaCode);
    return this._recentCalls;
  }

  apply(calls: StageCall[]) {
    for (const call of calls) {
      switch (call.name) {
        case "set_scene":
          this.setScene(call.args.sceneId, call.args.clear);
          break;
        case "add_character":
          this.addCharacter(
            call.args.characterId,
            call.args.outfitId,
            call.args.expressionId,
          );
          break;
        case "set_outfit":
          this.setOutfit(call.args.characterId, call.args.outfitId);
          break;
        case "set_expression":
          this.setExpression(call.args.characterId, call.args.expressionId);
          break;
        case "remove_character":
          this.removeCharacter(call.args.characterId);
          break;
        default:
          throw unreachable(call);
      }
    }
  }

  /**
   * Reset the stage immediately to the given state.
   */
  setState(state: StageState | null) {
    state = clone(state);
    this.state.value.scene = state?.scene || null;
    this.state.value.characters = state?.characters || [];
    this._connectedScene?.setState(state);
  }

  setScene(qualifiedId: string | null, clear: boolean) {
    if (qualifiedId) {
      const { locationId, sceneId } = parseQualifiedSceneId(qualifiedId);

      const location = this.scenario.locations.find((l) => l.id === locationId);
      if (!location)
        throw new StageCallError(`Location not found: ${locationId}`);

      const scene = location.scenes.find((s) => s.id === sceneId);
      if (!scene) throw new StageCallError(`Scene not found: ${sceneId}`);

      this.state.value.scene = { locationId, sceneId };
    }

    if (clear) {
      this.state.value.characters = [];
    }

    this._connectedScene?.setScene(qualifiedId, clear);
  }

  addCharacter(characterId: string, outfitId: string, expressionId: string) {
    const character = this.scenario.characters.find(
      (c) => c.id === characterId,
    );
    if (!character)
      throw new StageCallError(`Character not found: ${characterId}`);

    if (this.state.value.characters.find((c) => c.id === characterId)) {
      throw new StageCallError(`Character already on stage: ${characterId}`);
    }

    const outfit = character.outfits.find((o) => o.id === outfitId);
    if (!outfit) {
      throw new StageCallError(
        `Outfit not found for character ${characterId}: ${outfitId}`,
      );
    }

    const expression = character.expressions.find((e) => e.id === expressionId);
    if (!expression) {
      throw new StageCallError(
        `Expression not found for character ${characterId}: ${expressionId}`,
      );
    }

    this.state.value.characters.push({
      id: characterId,
      outfitId,
      expressionId,
    });
    this._connectedScene?.addCharacter(characterId, outfitId, expressionId);
  }

  setOutfit(characterId: string, outfitId: string) {
    const character = this.state.value.characters.find(
      (c) => c.id === characterId,
    );
    if (!character) {
      throw new StageCallError(`Character not on stage: ${characterId}`);
    }

    const outfit = this.scenario.characters
      .find((c) => c.id === characterId)
      ?.outfits.find((o) => o.id === outfitId);

    if (!outfit) {
      throw new StageCallError(
        `Outfit not found for character ${characterId}: ${outfitId}`,
      );
    }

    character.outfitId = outfitId;

    this._connectedScene?.setOutfit(characterId, outfitId);
  }

  setExpression(characterId: string, expressionId: string) {
    const character = this.state.value.characters.find(
      (c) => c.id === characterId,
    );
    if (!character) {
      throw new StageCallError(`Character not on stage: ${characterId}`);
    }

    const expression = this.scenario.characters
      .find((c) => c.id === characterId)
      ?.expressions.find((e) => e.id === expressionId);

    if (!expression) {
      throw new StageCallError(
        `Expression not found for character ${characterId}: ${expressionId}`,
      );
    }

    character.expressionId = expressionId;

    this._connectedScene?.setExpression(characterId, expressionId);
  }

  removeCharacter(characterId: string) {
    const index = this.state.value.characters.findIndex(
      (c) => c.id === characterId,
    );

    if (index === -1) {
      throw new StageCallError(`Character not on stage: ${characterId}`);
    }

    this.state.value.characters.splice(index, 1);

    this._connectedScene?.removeCharacter(characterId);
  }
}

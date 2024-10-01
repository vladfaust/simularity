import { env } from "@/env";
import { fs } from "@tauri-apps/api";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { toMinutes } from "duration-fns";
import {
  computed,
  markRaw,
  readonly,
  ref,
  shallowRef,
  triggerRef,
  type Raw,
  type Ref,
} from "vue";
import {
  CompletionAbortError,
  type CompletionOptions,
} from "./ai/llm/BaseLlmDriver";
import { d, parseSelectResult, sqlite, type Transaction } from "./drizzle";
import { writerUpdatesTableName } from "./drizzle/schema";
import { SQL_NOW } from "./drizzle/schema/_common";
import * as resources from "./resources";
import { Director } from "./simulation/agents/director";
import { Voicer } from "./simulation/agents/voicer";
import {
  Writer,
  type VisualizationOptions,
  type PredictionOptions as WriterPredictionOptions,
} from "./simulation/agents/writer";
import { PredictUpdateVariantJob } from "./simulation/jobs/predictUpdateVariant";
import {
  ImmersiveScenario,
  ensureScenario,
  type Scenario,
} from "./simulation/scenario";
import { type StageRenderer } from "./simulation/stageRenderer";
import {
  State,
  compareStateDeltas,
  emptyState,
  type StateDto,
} from "./simulation/state";
import { type StateCommand } from "./simulation/state/commands";
import { Update } from "./simulation/update";
import * as storage from "./storage";
import { directorTeacherMode } from "./storage/llm";
import { Bug, Deferred, assert, assertCallback } from "./utils";

export { State, type Scenario };

export enum Mode {
  Immersive = 0,
  Chat = 1,
}

type ImmersiveScenarioEpisodeChunk =
  ImmersiveScenario["content"]["episodes"][string]["chunks"][number];

export class Simulation {
  //#region Private fields
  /**
   * Historical updates up to to the current checkpoint (inclusive),
   * ordered from the oldest to the newest.
   */
  private readonly _historicalUpdates = ref<Raw<Update>[]>([]);

  /**
   * Updates from the current checkpoint (exclusive)
   * up to the current update (inclusive),
   * ordered from oldest to the newest.
   */
  private readonly _recentUpdates = ref<Raw<Update>[]>([]);

  /**
   * Updates following the current update (exclusive),
   * ordered from oldest to the newest.
   */
  private readonly _futureUpdates = ref<Raw<Update>[]>([]);

  private _busy = ref(false);
  private _previousState = shallowRef<StateDto>();

  // TODO: Make it always defined (i.e. simulation is always in valid state).
  private _checkpoint = shallowRef<
    typeof d.checkpoints.$inferSelect | undefined
  >();

  private _writer: Writer;

  /** undefined if the simulation is not immersive. */
  private _director: Director | undefined;

  private _voicer: Voicer;

  private _currentJob = shallowRef<PredictUpdateVariantJob | null>(null);
  //#endregion

  readonly state: State | undefined;

  /**
   * The simulation ID.
   */
  readonly id: number;

  /**
   * The scenario ID.
   */
  readonly scenarioId: string;

  /**
   * The mode of the simulation.
   */
  readonly mode: Mode;

  /**
   * The scenario.
   */
  readonly scenario: Scenario;

  readonly historicalUpdatesLength = computed(
    () => this._historicalUpdates.value.length,
  );

  readonly recentUpdatesLength = computed(
    () => this._recentUpdates.value.length,
  );

  readonly futureUpdatesLength = computed(
    () => this._futureUpdates.value.length,
  );

  /**
   * Simulation updates, ordered from oldest to the newest.
   */
  readonly updates = computed(() => {
    return [
      ...this._historicalUpdates.value,
      ...this._recentUpdates.value,
      ...this._futureUpdates.value,
    ];
  });

  /**
   * The current update index.
   */
  readonly currentUpdateIndex = computed(() => {
    return (
      this._historicalUpdates.value.length +
      this._recentUpdates.value.length -
      1
    );
  });

  /**
   * An update the simulation is currently at.
   */
  readonly currentUpdate = computed(() =>
    this.updates.value.at(this.currentUpdateIndex.value),
  );

  /**
   * Would be false if {@link currentUpdate} is the oldest update.
   */
  readonly canGoBack = computed(
    () =>
      this._recentUpdates.value.length > 1 ||
      this._historicalUpdates.value.length > 0,
  );

  /**
   * Would be false if {@link currentUpdate} is the latest update.
   */
  readonly canGoForward = computed(() => this._futureUpdates.value.length > 0);

  /**
   * Whether the simulation can load more historical updates.
   */
  readonly canLoadMoreHistoricalUpdates = computed(() => {
    return !!this._historicalUpdates.value.at(0)?.parentId;
  });

  /**
   * The `nextUpdateId` value of the latest fetched update.
   * If `null`, the simulation is at the very latest update.
   * If `undefined`, the `nextUpdateId` is not known.
   */
  readonly nextUpdateId = computed(() => {
    const latestUpdate = this.updates.value.at(-1);

    if (latestUpdate?.inProgressVariant.value) {
      // The latest update is in progress, therefore the next update is unknown.
      return null;
    } else {
      return latestUpdate?.chosenVariant?.writerUpdate.nextUpdateId;
    }
  });

  /**
   * Whether the simulation is currently expected to advance an episode.
   */
  readonly shallAdvanceEpisode = computed(() => {
    const writerUpdate = this.currentUpdate.value?.chosenVariant?.writerUpdate;
    if (!writerUpdate) return false;
    if (!writerUpdate.episodeId) return false;

    const episode = this.scenario.content.episodes[writerUpdate.episodeId];
    return writerUpdate.episodeChunkIndex! < episode.chunks.length - 1;
  });

  /**
   * A condition that allows creating a new user update.
   */
  readonly canCreateUserUpdate = computed(() => {
    return !this.busy.value && !this.shallAdvanceEpisode.value;
  });

  /**
   * Whether the simulation needs consolidation.
   */
  readonly needsConsolidation = computed(
    () => this._writer.needsConsolidation.value,
  );

  /**
   * The writer instance.
   */
  get writer() {
    return this._writer;
  }

  /**
   * The director instance.
   */
  get director() {
    return this._director;
  }

  /**
   * The voicer instance.
   */
  get voicer() {
    return this._voicer;
  }

  /**
   * The current job, if any.
   */
  readonly currentJob = computed(() => this._currentJob.value);

  /**
   * Whether the simulation is busy.
   */
  readonly busy = readonly(this._busy);

  readonly previousState = computed(() => this._previousState.value);

  readonly previousStateDelta = computed(() => {
    if (!this.state) {
      throw new Bug("State is not initialized (previousStateDelta)");
    }

    return this._previousState.value
      ? State.delta(this.state.serialize(), this._previousState.value)
      : null;
  });

  readonly ready = computed(
    () =>
      this.writer.ready.value &&
      (this.mode === Mode.Immersive
        ? this.director!.ready.value ||
          (env.VITE_EXPERIMENTAL_FEATURES && directorTeacherMode.value)
        : true),
  );

  /**
   * Context length of the current update, or the most recent update.
   */
  readonly contextLength = computed(() => {
    if (this.currentUpdate.value?.completionLength) {
      return this.currentUpdate.value.completionLength;
    } else if (this._recentUpdates.value.length) {
      for (let i = this._recentUpdates.value.length; i >= 0; i--) {
        const update = this._recentUpdates.value.at(i);

        if (update?.completionLength) {
          return update.completionLength;
        }
      }
    } else if (this._historicalUpdates.value.length) {
      for (let i = this._historicalUpdates.value.length; i >= 0; i--) {
        const update = this._historicalUpdates.value.at(i);

        if (update?.completionLength) {
          return update.completionLength;
        }
      }
    }
  });

  private readonly _consolidationInProgress = ref(false);
  readonly consolidationInProgress = readonly(this._consolidationInProgress);

  /**
   * Set the stage renderer, and sync it to the current stage state.
   */
  setStageRenderer(scene: StageRenderer) {
    if (!this.state) {
      throw new Bug("State is not initialized (setStageRenderer)");
    }

    this.state.connectStageRenderer(scene);
  }

  /**
   * Create a new simulation.
   */
  static async create(scenarioId: string, mode: Mode, episodeId?: string) {
    const scenario = await ensureScenario(scenarioId);
    episodeId ||= scenario.defaultEpisodeId;

    const startingEpisode = scenario.findEpisode(episodeId);
    if (!startingEpisode) {
      throw new Error(
        `Episode "${episodeId}" not found in scenario "${scenarioId}"`,
      );
    }

    const chunk = startingEpisode.chunks.at(0);
    if (!chunk) {
      throw new Error(`Episode "${startingEpisode.name}" has no chunks`);
    }

    const simulationId = await d.db.transaction(async (tx) => {
      const simulation = (
        await tx
          .insert(d.simulations)
          .values({
            scenarioId,
            mode,
            starterEpisodeId: episodeId,
          })
          .returning({ id: d.simulations.id })
      )[0];

      const checkpoint = (
        await tx
          .insert(d.checkpoints)
          .values({
            simulationId: simulation.id,
            summary: startingEpisode.initialCheckpoint.summary,
            state:
              scenario instanceof ImmersiveScenario
                ? (
                    startingEpisode as ImmersiveScenario["content"]["episodes"][string]
                  ).initialCheckpoint.state
                : undefined,
          })
          .returning({ id: d.checkpoints.id })
      )[0];

      const writerUpdate = (
        await tx
          .insert(d.writerUpdates)
          .values({
            simulationId: simulation.id,
            checkpointId: checkpoint.id,
            characterId: chunk.writerUpdate.characterId,
            text: chunk.writerUpdate.text,
            episodeId,
            episodeChunkIndex: 0,
            simulationDayClock: toMinutes({
              hours: chunk.writerUpdate.clock.hours,
              minutes: chunk.writerUpdate.clock.minutes,
            }),
          })
          .returning({
            id: d.writerUpdates.id,
          })
      )[0];

      if (scenario instanceof ImmersiveScenario && mode === Mode.Immersive) {
        const directorUpdate = (chunk as ImmersiveScenarioEpisodeChunk)
          .directorUpdate;

        if (directorUpdate) {
          await tx.insert(d.directorUpdates).values({
            writerUpdateId: writerUpdate.id,
            code: directorUpdate,
          });
        }
      }

      // Set simulation current update ID.
      await Simulation._updateSimulationHead(
        tx,
        simulation.id,
        writerUpdate.id,
      );

      return simulation.id;
    });

    return simulationId;
  }

  /**
   * Load a new simulation instance from the database and initialize it.
   */
  static async load(simulationId: number): Promise<Simulation> {
    const simulation = await d.db.query.simulations.findFirst({
      where: eq(d.simulations.id, simulationId),
    });

    if (!simulation) {
      throw new Error(`Simulation not found with ID ${simulationId}`);
    } else {
      console.debug("Found simulation", simulation);
    }

    const scenario = await ensureScenario(simulation.scenarioId);

    const instance = new Simulation(
      simulationId,
      simulation.scenarioId,
      simulation.mode,
      scenario,
    );

    await instance._init(simulation.currentUpdateId);

    return instance;
  }

  /**
   * If there is currently an active episode, create a new episode update.
   *
   * @assert Simulation is not busy.
   * @assert There is current episode.
   * @assert The episode has chunks left.
   */
  async advanceCurrentEpisode(enabledCharacterIds: Ref<Set<string>>) {
    if (this.busy.value) {
      throw new Error("Simulation is busy");
    }

    if (!this.shallAdvanceEpisode.value) {
      throw new Error("Shall not advance episode");
    }

    this._busy.value = true;
    try {
      const currentWriterUpdate =
        this.currentUpdate.value?.chosenVariant?.writerUpdate!;

      const episode =
        this.scenario.content.episodes[currentWriterUpdate.episodeId!];

      const chunk = episode.chunks[currentWriterUpdate.episodeChunkIndex! + 1];

      if (this.mode === Mode.Immersive) {
        this._dumpCurrentState();
      }

      const parentUpdateId =
        this.currentUpdate.value?.chosenVariant?.writerUpdate.id;
      console.debug("Parent update ID", parentUpdateId);

      const directorUpdate =
        this.mode === Mode.Immersive &&
        (chunk as ImmersiveScenarioEpisodeChunk).directorUpdate
          ? {
              code: (chunk as ImmersiveScenarioEpisodeChunk).directorUpdate!,
            }
          : undefined;

      const incoming = await Simulation._saveUpdatesToDb(this.id, {
        writerUpdate: {
          parentUpdateId,
          checkpointId: this._checkpoint.value!.id,
          characterId: chunk.writerUpdate.characterId,
          simulationDayClock: toMinutes({
            hours: chunk.writerUpdate.clock.hours,
            minutes: chunk.writerUpdate.clock.minutes,
          }),
          text: chunk.writerUpdate.text,
          episodeId: currentWriterUpdate.episodeId!,
          episodeChunkIndex: currentWriterUpdate.episodeChunkIndex! + 1,
        },
        directorUpdate,
      });

      if (directorUpdate) {
        console.log("Applying stage code", directorUpdate.code);
        this.state!.apply(directorUpdate.code);
      }

      // Add the new episode update to the recent updates.
      const episodeUpdate = markRaw(
        new Update(
          parentUpdateId,
          shallowRef([
            {
              ...incoming,
              state: this.state?.serialize(),
              ttsPath: ref(null),
            },
          ]),
        ),
      );

      this._recentUpdates.value.push(episodeUpdate);

      if (chunk.enabledCharacters) {
        enabledCharacterIds.value = new Set(chunk.enabledCharacters);
      }
    } finally {
      this._busy.value = false;
    }
  }

  /**
   * Manually create a new update. Does not predict the next update.
   * If there is a future update, adds a new variant to it and makes it
   * the next recent update instead of creating a new recent update object.
   *
   * @assert Simulation is not busy.
   * @assert There is no current episode.
   *
   * @param text The message text.
   */
  async createUpdate(characterId: string | null, text: string) {
    if (this.busy.value) {
      throw new Error("Simulation is busy");
    }

    if (this.shallAdvanceEpisode.value) {
      /** Call {@link advanceCurrentEpisode} instead. */
      throw new Error("Cannot create an update during an episode");
    }

    this._busy.value = true;
    try {
      if (this.mode === Mode.Immersive) {
        await this._commitCurrentState();
        this._dumpCurrentState();
      }

      const parentWriterUpdate =
        this.currentUpdate.value?.chosenVariant?.writerUpdate;
      const parentUpdateId = parentWriterUpdate?.id;

      // Insert the new writer update to the database.
      let saved = await Simulation._saveUpdatesToDb(this.id, {
        writerUpdate: {
          parentUpdateId,
          checkpointId: this._checkpoint.value!.id,
          characterId,

          // TODO: Allow specifying the clock.
          simulationDayClock: parentWriterUpdate
            ? parentWriterUpdate.simulationDayClock + 1
            : 0,

          text,
          createdByPlayer: true,
        },
      });

      if (this._futureUpdates.value.length) {
        // Add a new variant to the existing next update.
        const update = this._futureUpdates.value.shift()!;
        update.variants.value.push({
          ...saved,
          state: this.state?.serialize(),
          ttsPath: ref(null),
        });
        update.setChosenVariantToLast();

        // Shift the future update to the recent updates.
        this._recentUpdates.value.push(update);

        // Clear the future updates.
        this._futureUpdates.value = [];
      } else {
        // Create a new update object.
        const update = markRaw(
          new Update(
            parentUpdateId,
            shallowRef([
              {
                ...saved,
                state: this.state?.serialize(),
                ttsPath: ref(null),
              },
            ]),
          ),
        );

        // Add the new update to the recent updates.
        this._recentUpdates.value.push(update);
      }
    } finally {
      this._busy.value = false;
    }
  }

  /**
   * Predict the next update.
   * Would consolidate the simulation if necessary.
   *
   * @assert There is no current episode.
   * @assert Can not go forward.
   */
  async predictUpdate(
    nEval: number,
    predictionOptions?: WriterPredictionOptions,
    inferenceOptions?: CompletionOptions,
    inferenceAbortSignal?: AbortSignal,
  ) {
    console.debug("predictUpdate()", {
      nEval,
      predictionOptions,
      inferenceOptions,
    });

    if (this.busy.value) {
      throw new Error("Simulation is busy");
    }

    if (this.shallAdvanceEpisode.value) {
      throw new Error("Cannot create assistant update during an episode");
    }

    if (this.canGoForward.value) {
      throw new Error(
        "Cannot predict the next update if there are future updates",
      );
    }

    if (!this.ready.value) {
      throw new Error("Simulaton is not ready");
    }

    this._busy.value = true;
    try {
      if (this.needsConsolidation.value) {
        console.log("Simulation needs consolidation");
        await this.consolidate(false);
      }

      if (this.mode === Mode.Immersive) {
        await this._commitCurrentState();
        this._dumpCurrentState();
      }

      const update = markRaw(
        new Update(this.currentUpdate.value?.chosenVariant?.writerUpdate.id),
      );

      this._recentUpdates.value.push(update);

      await this._inferUpdateVariantImpl(
        update,
        this._recentUpdates.value.slice(0, -1), // Skip the just created update.
        { nEval, predictionOptions, inferenceOptions },
        inferenceAbortSignal,
      );
      if (inferenceAbortSignal?.aborted) {
        console.warn("Writer inference aborted");
        return;
      }
    } catch (e) {
      console.log("Removing the recent update due to error");
      this._recentUpdates.value.pop();
      throw e;
    } finally {
      this._busy.value = false;
    }
  }

  /**
   * Generate a new current update variant (i.e. regenerate).
   * Requires fading due to hard state reset.
   * Clears the future updates.
   *
   * @assert The simulation is not busy.
   */
  async predictCurrentUpdateVariant(
    nEval: number,
    predictionOptions?: WriterPredictionOptions,
    inferenceOptions?: CompletionOptions,
    inferenceAbortSignal?: AbortSignal,
  ) {
    if (this.busy.value) {
      throw new Error("Cannot regenerate while busy");
    }

    if (!this.currentUpdate.value) {
      throw new Error("No current update");
    }

    if (this.mode === Mode.Immersive) {
      if (!this._previousState.value) {
        throw new Bug(
          "No previous state to reset to (predictCurrentUpdateVariant)",
        );
      }
    }

    this._busy.value = true;
    try {
      // Clear the future updates.
      this._futureUpdates.value = [];

      if (this.mode === Mode.Immersive) {
        if (!this.state) {
          throw new Bug(
            "State is not initialized (predictCurrentUpdateVariant)",
          );
        }

        // Reset the state to the previous one.
        await this._commitCurrentState();
        this.state.setState(this._previousState.value!);
        console.debug("State after reset", this.state!.serialize());
      }

      // Infer the new variant.
      await this._inferUpdateVariantImpl(
        this.currentUpdate.value,
        this._recentUpdates.value.slice(0, -1), // Skip the current update.
        { nEval, predictionOptions, inferenceOptions },
        inferenceAbortSignal,
      );
    } finally {
      this._busy.value = false;
    }
  }

  /**
   * Choose an existing current update variant.
   * Requires fading due to hard state reset.
   * @assert The simulation is not busy.
   */
  async chooseCurrentUpdateVariant(variantIndex: number) {
    console.debug("chooseCurrentUpdateVariant()", { variantIndex });

    if (this.busy.value) {
      throw new Error("Simulation is busy");
    }

    const currentUpdate = this.currentUpdate.value;
    if (!currentUpdate) {
      throw new Error("No current update");
    }

    if (
      !(variantIndex >= 0 && variantIndex < currentUpdate.variants.value.length)
    ) {
      throw new Error(
        `Variant index out of range (${variantIndex}, expected [0, ${currentUpdate.variants.value.length})`,
      );
    }

    if (this.mode === Mode.Immersive) {
      if (!this._previousState.value) {
        throw new Bug("No previous state to reset to");
      }

      await this._commitCurrentState();
    }

    currentUpdate.chosenVariantIndex.value = variantIndex;
    const newVariant = currentUpdate.ensureChosenVariant;

    if (this.mode === Mode.Immersive) {
      if (!this.state) {
        throw new Bug("State is not initialized (chooseCurrentUpdateVariant)");
      }

      // Synchronize the state with the chosen variant.
      this.state.setState(this._previousState.value!);
      if (newVariant.directorUpdate === undefined) {
        console.debug(
          "Fetching applied director update for the chosen variant",
        );
        newVariant.directorUpdate =
          await Simulation._fetchAppliedDirectorUpdate(
            newVariant.writerUpdate.id,
          );
      }
      const code = newVariant.directorUpdate?.code;
      if (code) {
        console.debug("Applying director update code", code);
        this.state.apply(code);
      }
    }

    // Fetch new future updates.
    this._futureUpdates.value = newVariant.writerUpdate.nextUpdateId
      ? await Simulation._fetchWriterUpdateDescendants(
          newVariant.writerUpdate.nextUpdateId,
        ).then((updates) =>
          Promise.all(updates.map((u) => this._createUpdate(u, true))),
        )
      : [];

    await d.db.transaction(async (tx) => {
      // Set the parent's `nextUpdateId` to the chosen variant.
      const parentUpdateId = currentUpdate.parentId;
      if (parentUpdateId) {
        const nextUpdateId = newVariant.writerUpdate.id;
        await d.db
          .update(d.writerUpdates)
          .set({ nextUpdateId })
          .where(and(eq(d.writerUpdates.id, parentUpdateId)));
      } else {
        console.warn("Parent update ID is not set");
      }

      // Update simulation's current update ID.
      await Simulation._updateSimulationHead(
        tx,
        this.id,
        newVariant.writerUpdate.id,
      );
    });
  }

  /**
   * Edit the text of an update variant.
   *
   * @assert The simulation is not busy.
   * @assert There are changes to apply.
   */
  async editUpdateVariant(
    variant: (typeof Update.prototype.variants)["value"][0],
    newText?: string,
    newCharacterId?: string | null,
  ) {
    if (this.busy.value) {
      throw new Error("Simulation is busy");
    }

    if (!newText && !newCharacterId) {
      throw new Error("No changes to apply");
    }

    try {
      this._busy.value = true;

      // TODO: Preserve original text.
      await d.db
        .update(d.writerUpdates)
        .set({ characterId: newCharacterId, text: newText })
        .where(eq(d.writerUpdates.id, variant.writerUpdate.id));

      if (newText) {
        variant.writerUpdate.text = newText;
      }

      if (newCharacterId) {
        variant.writerUpdate.characterId = newCharacterId;
      }
    } finally {
      this._busy.value = false;
    }
  }

  /**
   * Consolidate the simulation at the current update.
   */
  async consolidate(
    throwOnAlreadyConsolidated: boolean,
    inferenceAbortSignal?: AbortSignal,
  ) {
    if (this.busy.value) {
      return new Error("Simulation is busy");
    }

    if (!this.writer.ready.value) {
      return new Error("Writer is not ready");
    }

    if (this.shallAdvanceEpisode.value) {
      return new Error("Cannot consolidate during an episode");
    }

    const writerUpdate = this.currentUpdate.value?.chosenVariant?.writerUpdate;
    if (!writerUpdate) {
      throw new Error("No current update");
    }

    if (writerUpdate.didConsolidate) {
      if (throwOnAlreadyConsolidated) {
        return new Error("Update is already consolidated");
      } else {
        console.log("Update is already consolidated");
        return;
      }
    }

    this._busy.value = true;
    this._consolidationInProgress.value = true;
    try {
      const summarizationResult = await this.writer.summarize(
        this._checkpoint.value!,
        this._historicalUpdates.value,
        this._recentUpdates.value,
        this.state?.serialize(),
        256,
        inferenceAbortSignal,
      );

      console.log("Summarization result", summarizationResult);

      await d.db.transaction(async (tx) => {
        const previousCheckpointId = this._checkpoint.value!.id;

        // Create a new checkpoint.
        this._checkpoint.value = (
          await tx
            .insert(d.checkpoints)
            .values({
              simulationId: this.id,
              writerUpdateId: writerUpdate.id,
              summary: summarizationResult.newSummary,
              state: this.state?.serialize(),
            })
            .returning()
        )[0];

        // Update the writer update.
        await tx
          .update(d.writerUpdates)
          .set({
            didConsolidate: true,
            checkpointId: this._checkpoint.value!.id,
          })
          .where(eq(d.writerUpdates.id, writerUpdate.id));

        writerUpdate.didConsolidate = true;

        const futureUpdatesToUpdate = this._futureUpdates.value.filter(
          (update) => {
            return (
              update.ensureChosenVariant.writerUpdate.checkpointId ===
              previousCheckpointId
            );
          },
        );

        // For all future updates previously set
        // for the previous checkpoint,
        // set the new checkpoint ID.
        if (futureUpdatesToUpdate.length) {
          console.log(
            `Updating ${
              futureUpdatesToUpdate.length
            } future updates to new checkpoint ID ${
              this._checkpoint.value!.id
            }...`,
          );

          await tx
            .update(d.writerUpdates)
            .set({ checkpointId: this._checkpoint.value!.id })
            .where(
              and(
                inArray(
                  d.writerUpdates.id,
                  futureUpdatesToUpdate.map(
                    (u) => u.ensureChosenVariant.writerUpdate.id,
                  ),
                ),
              ),
            );

          for (const update of this._futureUpdates.value) {
            // Update the checkpoint ID in the update object.
            update.ensureChosenVariant.writerUpdate.checkpointId =
              this._checkpoint.value!.id;
          }
        }
      });

      // Move all recent updates to historical updates.
      this._historicalUpdates.value.push(
        ...this._recentUpdates.value.splice(0),
      );
    } catch (e: any) {
      if (e instanceof CompletionAbortError) {
        console.warn("Inference aborted");
      } else {
        throw e;
      }
    } finally {
      this._consolidationInProgress.value = false;
      this._busy.value = false;
    }
  }

  // TODO: async editAssistantUpdateVariantCode() {}

  /**
   * Fetch more historical updates.
   * @throws If {@link canLoadMoreHistoricalUpdates} is false.
   */
  async loadMoreHistoricalUpdates(limit: number) {
    if (!this.canLoadMoreHistoricalUpdates.value) {
      throw new Error("Cannot load more historical updates");
    }

    const parentUpdateId = this._historicalUpdates.value.at(0)?.parentId!;

    const updates = await Simulation._fetchWriterUpdateAncestors(
      parentUpdateId,
      undefined,
      limit,
    ).then((updates) =>
      Promise.all(updates.reverse().map((u) => this._createUpdate(u, true))),
    );

    this._historicalUpdates.value.unshift(...updates);
  }

  /**
   * Go back to the previous (older) update.
   * Always requires fading due to hard state reset.
   */
  async goBack() {
    if (!this.canGoBack.value) throw new Error("Cannot go back");

    if (this.mode === Mode.Immersive) {
      await this._commitCurrentState();
    }

    if (this._recentUpdates.value.length > 1) {
      console.debug("Going back to the previous recent update");

      // Simply move one recent update back.
      this._futureUpdates.value.unshift(this._recentUpdates.value.pop()!);

      if (this.mode === Mode.Immersive) {
        // NOTE: Would need to set pre-previous state, therefore simple
        // `this.state.setState(this._previousState.value)` is not enough.
        this._resetStateToCurrentUpdate(true);
      }
    } else {
      // We're at the earliest recent update, therefore need to move back
      // to the historical updates. Checkpoint is guaranteed to change,
      // therefore it'd be easier to do full refetch.
      //

      console.debug("Going back to the historical updates");

      const latestHistoricalUpdate = this._historicalUpdates.value.at(-1);
      if (!latestHistoricalUpdate) {
        throw new Error("No historical updates left");
      }

      const newCurrentWriterUpdateId =
        latestHistoricalUpdate.ensureChosenVariant.writerUpdate.id;
      if (!newCurrentWriterUpdateId) {
        throw new Error("BUG: No new current update ID");
      }

      await this._jumpToId(newCurrentWriterUpdateId);
    }
  }

  /**
   * Jump to an update at specific index.
   * Requires fading due to hard state reset.
   *
   * @param newStateIncludesCurrentUpdate If true, would include the new
   * current update in the new state, otherwise would set the state
   * to the previous update.
   *
   * @assert The index is within the {@link updates} range.
   */
  async jumpToIndex(newIndex: number, newStateIncludesCurrentUpdate = true) {
    console.debug("jumpToIndex()", {
      newIndex,
      newStateIncludesCurrentUpdate,
    });

    assert(
      newIndex >= 0 && newIndex < this.updates.value.length,
      "Index out of range",
    );

    if (this.busy.value) {
      throw new Error("Simulation is busy");
    }

    if (newIndex === this.currentUpdateIndex.value) {
      console.warn("Already at the current update");
      return;
    }

    if (this.mode === Mode.Immersive) {
      await this._commitCurrentState();
    }

    // Jump to a historical update, which may be of a different checkpoint,
    // thus requiring full refetch.
    if (
      this._historicalUpdates.value.length &&
      newIndex < this._historicalUpdates.value.length
    ) {
      console.debug("Long-jumping to a historical update");
      const target = this._historicalUpdates.value.at(newIndex);
      if (!target) throw new Error("BUG: Missing target update");
      await this._jumpToId(
        target.ensureChosenVariant.writerUpdate.id,
        newStateIncludesCurrentUpdate,
      );
    }

    // Jump to a recent update (same checkpoint).
    else if (
      newIndex <
      this._historicalUpdates.value.length + this._recentUpdates.value.length
    ) {
      console.debug("Short-jumping to a (previous) recent update");

      // Simply move recent updates to future updates.
      this._futureUpdates.value.unshift(
        ...this._recentUpdates.value.splice(
          newIndex - this._historicalUpdates.value.length + 1,
        ),
      );

      if (this.mode === Mode.Immersive) {
        // NOTE: Would need to set pre-previous state, therefore simple
        // `this.state.setState(this._previousState.value)` is not enough.
        this._resetStateToCurrentUpdate(newStateIncludesCurrentUpdate);
      }

      // Set simulation head to the new current update.
      await Simulation._updateSimulationHead(
        d.db,
        this.id,
        this.currentUpdate.value!.ensureChosenVariant.writerUpdate.id,
      );
    }

    // Jump to a future update, which may be of a different checkpoint.
    else {
      console.debug("Long-jumping to a future update");

      const target = this._futureUpdates.value.at(
        newIndex -
          this._historicalUpdates.value.length -
          this._recentUpdates.value.length,
      );
      if (!target) throw new Error("BUG: Missing target update");

      await this._jumpToId(
        target.ensureChosenVariant.writerUpdate.id,
        newStateIncludesCurrentUpdate,
      );
    }
  }

  /**
   * Go forward to the next future update.
   * Applies its director update smoothly, if any.
   * Fetches the next future update, if there are no more.
   */
  async goForward() {
    if (!this.canGoForward.value) throw new Error("Cannot go forward");

    const nextCurrentUpdate = this._futureUpdates.value.shift();
    if (!nextCurrentUpdate) throw new Error("No future updates");

    // Fetch another future update, if there are no more.
    if (!this._futureUpdates.value.length) {
      const nextUpdateId =
        nextCurrentUpdate.ensureChosenVariant.writerUpdate.nextUpdateId;

      if (nextUpdateId) {
        // Fetch the next update.
        await d.db.query.writerUpdates
          .findFirst({
            where: eq(d.writerUpdates.id, nextUpdateId),
          })
          .then((writerUpdate) => {
            if (!writerUpdate) {
              throw new Error(`BUG: Next update not found: ${nextUpdateId}`);
            }

            return writerUpdate;
          })
          .then((writerUpdate) => this._createUpdate(writerUpdate, true, true))
          .then((update) => this._futureUpdates.value.push(update));
      } else {
        console.debug("No more future updates to fetch");
      }
    }

    const nextCheckpointId =
      nextCurrentUpdate.ensureChosenVariant.writerUpdate.checkpointId;

    if (nextCheckpointId !== this._checkpoint.value!.id) {
      // NOTE: The new checkpoint is expected to have state similar
      // to the current state, therefore smooth transition is possible.
      this._checkpoint.value = await d.db.query.checkpoints.findFirst({
        where: eq(d.checkpoints.id, nextCheckpointId),
      });

      this._historicalUpdates.value.push(
        ...this._recentUpdates.value.splice(0),
      );
    }

    if (this.mode === Mode.Immersive) {
      await this._commitCurrentState();
      this._dumpCurrentState();
    }

    this._recentUpdates.value.push(nextCurrentUpdate);

    const variant = nextCurrentUpdate.chosenVariant;
    if (!variant) throw new Error("BUG: No chosen variant");

    if (this.mode === Mode.Immersive) {
      if (!this.state) {
        throw new Bug("State is not initialized (goForward)");
      }

      if (variant.directorUpdate === undefined) {
        console.debug(
          "Fetching missing director update for",
          variant.writerUpdate.id,
        );

        variant.directorUpdate = await Simulation._fetchAppliedDirectorUpdate(
          variant.writerUpdate.id,
        );
      }

      const directorUpdate = variant.directorUpdate;
      if (directorUpdate) {
        console.debug("Applying stage code", directorUpdate.code);
        this.state.apply(directorUpdate.code);
        console.debug(
          "State after applying stage code",
          this.state.serialize(),
        );
      } else {
        console.debug("No director update to apply");
      }
    }

    // Update simulation's current update ID.
    await Simulation._updateSimulationHead(
      d.db,
      this.id,
      variant.writerUpdate.id,
    );
  }

  /**
   * Fetch more future updates.
   * @throws If {@link canLoadMoreFutureUpdates} is false.
   */
  async loadMoreFutureUpdates(limit: number) {
    if (!this.nextUpdateId.value) {
      throw new Error("Cannot load more future updates");
    }

    const updates = await Simulation._fetchWriterUpdateDescendants(
      this.nextUpdateId.value,
      limit,
    ).then((updates) =>
      Promise.all(updates.map((u) => this._createUpdate(u, true))),
    );

    this._futureUpdates.value.push(...updates);
  }

  /**
   * Prefer, disprefer or remove preference from writer update.
   */
  async preferWriterUpdate(update: Update, preference: boolean | null) {
    const writerUpdate = update.ensureChosenVariant.writerUpdate;

    if (writerUpdate.preference === preference) {
      console.warn("Writer update preference is already set to", preference);
      return;
    }

    await d.db
      .update(d.writerUpdates)
      .set({ preference })
      .where(eq(d.writerUpdates.id, writerUpdate.id));

    writerUpdate.preference = preference;
  }

  /**
   * Prefer, disprefer or remove preference from a director update.
   */
  async preferDirectorUpdate(update: Update, preference: boolean | null) {
    const directorUpdate = update.ensureChosenVariant.directorUpdate;
    if (!directorUpdate) throw new Error("BUG: No update to prefer");

    if (directorUpdate.preference === preference) {
      console.warn("Director update preference is already set to", preference);
      return;
    }

    await d.db
      .update(d.directorUpdates)
      .set({ preference })
      .where(eq(d.directorUpdates.id, directorUpdate.id));

    directorUpdate.preference = preference;
  }

  /**
   * Manually overwrite the director update of the current update.
   * Will prefer it over the other director updates for the same writer update.
   */
  async overwriteDirectorUpdate(update: Update, code: StateCommand[]) {
    const writerUpdateId = update.ensureChosenVariant.writerUpdate.id;

    console.log("Overwriting director update", {
      writerUpdateId,
      code,
    });

    const directorUpdate = await d.db.transaction(async (tx) => {
      // Un-prefer the previous director updates.
      await tx
        .update(d.directorUpdates)
        .set({ preference: false })
        .where(eq(d.directorUpdates.writerUpdateId, writerUpdateId));

      // Create a new preferred director update.
      return (
        await tx
          .insert(d.directorUpdates)
          .values({
            writerUpdateId,
            preference: true,
            code,
          })
          .returning()
      )[0];
    });

    update.ensureChosenVariant.directorUpdate = directorUpdate;
    update.ensureChosenVariant.state = undefined;

    triggerRef(update.variants);
  }

  /**
   * Infer visual prompt for current update.
   */
  async inferVisualPrompt(
    nEval = 128,
    visualizationOptions?: VisualizationOptions,
    completionOptions?: CompletionOptions,
    abortSignal?: AbortSignal,
  ) {
    return await this.writer.visualize(
      this._checkpoint.value!,
      this._historicalUpdates.value,
      this._recentUpdates.value,
      this.state?.serialize() || emptyState(),
      nEval,
      visualizationOptions,
      completionOptions,
      abortSignal,
    );
  }

  /**
   * Infer TTS for an update variant.
   * @returns The TTS job, or null if the TTS audio already exists.
   */
  inferTts(
    variant: Update["ensureChosenVariant"],
    force: boolean = false,
  ): {
    promise: Promise<string>;
    cancel: () => void;
  } | null {
    if (variant.ttsPath.value && !force) {
      console.warn("TTS audio element already exists");
      return null;
    }

    if (!this.voicer.ttsDriver.value || !storage.tts.ttsConfig.value?.enabled) {
      throw new Error("TTS is disabled");
    }

    if (!this.voicer.ttsDriver.value.ready.value) {
      console.warn("TTS driver is not ready");
      return null;
    }

    const job = markRaw(
      this.voicer.createTtsJob(
        variant.writerUpdate.characterId,
        variant.writerUpdate.text,
      ),
    );

    const deferred = new Deferred<string>();
    const returned = {
      promise: deferred.promise,
      cancel: () => job.cancel(),
    };

    job.result.promise.then(async (result) => {
      if (result instanceof Error) {
        deferred.reject(result);
        throw result;
      }

      console.debug("Saving TTS audio");

      variant.ttsPath.value = await resources.tts.saveAudio(
        this.id,
        variant.writerUpdate.id,
        result,
        ".wav",
      );

      deferred.resolve(variant.ttsPath.value);
    });

    return returned;
  }

  destroy() {
    this.writer.destroy();
    this.director?.destroy();
    this.voicer.destroy();
  }

  //#region Private methods
  //

  /**
   * @private
   *
   * Fetch the ancestor updates recursively: the first update will be the one
   * with ID `descendantUpdateId`, followed by its ancestor, and so on.
   *
   * @param descendantUpdateId The first update ID to fetch.
   * @param checkpointId If set, would only fetch updates with the specified checkpoint.
   * @param limit If set, would limit the depth of the fetched updates.
   */
  static async _fetchWriterUpdateAncestors(
    descendantUpdateId: number,
    checkpointId?: number | null,
    limit?: number,
    includeCompletions = true,
  ) {
    let checkpointClauseA = "";
    let checkpointClauseB = "";

    if (checkpointId === null) {
      checkpointClauseA = `AND ${d.writerUpdates.checkpointId.name} IS NULL`;
      checkpointClauseB = `WHERE parent.${d.writerUpdates.checkpointId.name} IS NULL`;
    } else if (checkpointId) {
      checkpointClauseA = `AND ${d.writerUpdates.checkpointId.name} = ?`;
      checkpointClauseB = `WHERE parent.${d.writerUpdates.checkpointId.name} = ?`;
    }

    const writerUpdatesQuery = new SQLiteSyncDialect().sqlToQuery(
      sql.raw(`
          WITH
            writer_updates_tree AS (
              SELECT
                ${this.__writerSelectFields()}
              FROM
                ${writerUpdatesTableName}
              WHERE
                ${d.writerUpdates.id.name} = ? ${checkpointClauseA}
              UNION ALL
              SELECT
                ${this.__writerSelectFields("parent.")}
              FROM
                ${writerUpdatesTableName} parent
                JOIN writer_updates_tree child ON child.${d.writerUpdates.parentUpdateId.name} = parent.${d.writerUpdates.id.name}
              ${checkpointClauseB}
            )
          SELECT
            *
          FROM
            writer_updates_tree
          ${limit ? `LIMIT ?` : ""}
      `),
    );

    const params: any[] = [descendantUpdateId];
    if (checkpointId) {
      params.push(checkpointId);
      params.push(checkpointId);
    }
    if (limit) params.push(limit);

    const result = await sqlite.query(writerUpdatesQuery.sql, params);
    const writerUpdates = parseSelectResult(d.writerUpdates, result);

    if (includeCompletions) {
      return this._fetchLlmCompletions(writerUpdates);
    } else {
      return writerUpdates;
    }
  }

  /**
   * Fetch children writer updates starting at `nextUpdateId` (inclusive),
   * sorted from the oldest to the newest. It uses a recursive CTE
   * to fetch the updates starting from `nextUpdateId`.
   *
   * @param nextUpdateId The ID of the next update, from which to fetch the updates.
   * @param limit If set, would limit the number of fetched updates.
   */
  private static async _fetchWriterUpdateDescendants(
    nextUpdateId: number,
    limit?: number,
    includeCompletions = true,
  ) {
    const writerUpdatesQuery = new SQLiteSyncDialect().sqlToQuery(
      sql.raw(`
          WITH
            writer_updates_tree AS (
              SELECT
                ${this.__writerSelectFields()}
              FROM
                ${writerUpdatesTableName}
              WHERE
                ${d.writerUpdates.id.name} = ?
              UNION ALL
              SELECT
                ${this.__writerSelectFields("next.")}
              FROM
                ${writerUpdatesTableName} next
                JOIN writer_updates_tree parent ON parent.${d.writerUpdates.nextUpdateId.name} = next.${d.writerUpdates.id.name}
            )
          SELECT
            *
          FROM
            writer_updates_tree
          ${limit ? `LIMIT ?` : ""}
      `),
    );

    const params: any[] = [nextUpdateId];
    if (limit) params.push(limit);

    const result = await sqlite.query(writerUpdatesQuery.sql, params);
    const writerUpdates = parseSelectResult(d.writerUpdates, result);

    if (includeCompletions) {
      return this._fetchLlmCompletions(writerUpdates);
    } else {
      return writerUpdates;
    }
  }

  /**
   * @private
   * Fetch the applied (i.e. latest) director update for a writer update.
   */
  static async _fetchAppliedDirectorUpdate(writerUpdateId: number) {
    return (
      (await d.db.query.directorUpdates.findFirst({
        where: eq(d.directorUpdates.writerUpdateId, writerUpdateId),
        orderBy: desc(d.directorUpdates.createdAt),
      })) ?? null
    );
  }

  /**
   * Turn a writer update into an update object.
   *
   * @param isCheckpoint If set, would mark the update as a checkpoint.
   * @param fetchSiblings If set, would fetch siblings of the writer update.
   * @param fetchAppliedDirectorUpdate If set, would fetch the applied
   * director update for this writer update. Note that siblings' director
   * updates are not fetched.
   */
  // FIXME: `isCheckpoint` doesn't feel right.
  private async _createUpdate(
    writerUpdate: typeof d.writerUpdates.$inferSelect & {
      completion?: typeof d.llmCompletions.$inferSelect | null;
    },
    fetchSiblings = false,
    fetchAppliedDirectorUpdate = false,
  ): Promise<Update> {
    const writerUpdates = fetchSiblings
      ? await d.db.query.writerUpdates.findMany({
          where: and(
            eq(d.writerUpdates.simulationId, writerUpdate.simulationId),
            writerUpdate.parentUpdateId
              ? eq(d.writerUpdates.parentUpdateId, writerUpdate.parentUpdateId)
              : isNull(d.writerUpdates.parentUpdateId),
          ),
          with: {
            completion: true,
          },
        })
      : [writerUpdate];

    let directorUpdate =
      this.mode === Mode.Immersive && fetchAppliedDirectorUpdate
        ? await Simulation._fetchAppliedDirectorUpdate(writerUpdate.id)
        : undefined;

    const variants = await Promise.all(
      writerUpdates.map(async (writerUpdate) => {
        const ttsPath: string = await resources.tts.audioFilePath(
          this.id,
          writerUpdate.id,
          ".wav",
        );

        return {
          writerUpdate,
          ttsPath: ref((await fs.exists(ttsPath)) ? ttsPath : null),
        };
      }),
    );

    const update = markRaw(
      new Update(writerUpdate.parentUpdateId, shallowRef(variants)),
    );

    update.chosenVariantIndex.value = assertCallback(
      update.variants.value.findIndex(
        (v) => v.writerUpdate.id === writerUpdate.id,
      ),
      (index) => index >= 0,
      "BUG: Chosen variant not found in siblings",
    );

    if (this.mode === Mode.Immersive) {
      update.ensureChosenVariant.directorUpdate = directorUpdate;
    }

    return update;
  }

  /**
   * Set simulation current (head) writer update ID to `writerUpdateId`.
   */
  private static async _updateSimulationHead(
    tx: Transaction | typeof d.db = d.db,
    simulationId: number,
    writerUpdateId: number,
  ) {
    return tx
      .update(d.simulations)
      .set({
        currentUpdateId: writerUpdateId,
        updatedAt: SQL_NOW,
      })
      .where(eq(d.simulations.id, simulationId));
  }

  /**
   * An utility function to save on duplication.
   */
  private static __writerSelectFields(prefix: string = "") {
    return `${prefix}${d.writerUpdates.id.name},
${prefix}${d.writerUpdates.simulationId.name},
${prefix}${d.writerUpdates.parentUpdateId.name},
${prefix}${d.writerUpdates.nextUpdateId.name},
${prefix}${d.writerUpdates.checkpointId.name},
${prefix}${d.writerUpdates.didConsolidate.name},
${prefix}${d.writerUpdates.createdByPlayer.name},
${prefix}${d.writerUpdates.characterId.name},
${prefix}${d.writerUpdates.simulationDayClock.name},
${prefix}${d.writerUpdates.text.name},
${prefix}${d.writerUpdates.episodeId.name},
${prefix}${d.writerUpdates.episodeChunkIndex.name},
${prefix}${d.writerUpdates.llmCompletionId.name},
${prefix}${d.writerUpdates.preference.name},
${prefix}${d.writerUpdates.createdAt.name}`;
  }

  /**
   * Fetch LLM completions for the writer updates,
   * returning the updates with `completion` field.
   */
  private static async _fetchLlmCompletions(
    writerUpdates: (typeof d.writerUpdates.$inferSelect)[],
  ) {
    const llmCompletionIds = writerUpdates
      .filter((u) => u.llmCompletionId)
      .map((u) => u.llmCompletionId) as number[];

    if (llmCompletionIds.length) {
      const llmCompletions = await d.db.query.llmCompletions.findMany({
        where: inArray(d.llmCompletions.id, llmCompletionIds),
      });

      return writerUpdates.map((writerUpdate) => ({
        ...writerUpdate,
        completion:
          llmCompletions.find((c) => c.id === writerUpdate.llmCompletionId) ??
          null,
      }));
    }

    return writerUpdates;
  }

  private constructor(
    id: number,
    scenarioId: string,
    mode: Mode,
    scenario: Scenario,
  ) {
    if (mode === Mode.Immersive && !(scenario instanceof ImmersiveScenario)) {
      throw new Error("Immersive mode requires an immersive scenario");
    }

    this.id = id;
    this.scenarioId = scenarioId;
    this.mode = mode;
    this.scenario = scenario;

    this.state =
      mode === Mode.Immersive
        ? new State(scenario as ImmersiveScenario)
        : undefined;

    this._writer = new Writer(this.scenario);

    this._director =
      mode === Mode.Immersive
        ? new Director(this.scenario as ImmersiveScenario)
        : undefined;

    this._voicer = new Voicer(this.scenario);
  }

  /**
   * Wait until the simulation is initialized.
   * Triggers writer initialization in the background.
   */
  private async _init(currentWriterUpdateId: number | null) {
    if (currentWriterUpdateId) {
      await this._jumpToId(currentWriterUpdateId);
    }
  }

  /**
   * Long-jump to a specific update.
   *
   * @param historicalUpdatesLimit Historical and future updates fetch limit.
   * @param newStateIncludesCurrentUpdate If true, the new state
   * would include the current update's code.
   */
  // OPTIMIZE: Reuse updates whenever possible.
  private async _jumpToId(
    writerUpdateId: number,
    newStateIncludesCurrentUpdate = true,
    historicalUpdatesLimit = 10,
  ) {
    console.debug("_jumpToId()", {
      writerUpdateId,
      newStateIncludesCurrentUpdate,
      historicalUpdatesLimit,
    });

    assert(
      historicalUpdatesLimit > 0,
      "Historical updates limit must be positive",
    );

    // Fetch the to-become-current writer update.
    const currentWriterUpdate = await d.db.query.writerUpdates.findFirst({
      columns: {
        id: true,
        checkpointId: true,
        nextUpdateId: true,
      },
      where: eq(d.writerUpdates.id, writerUpdateId),
    });
    if (!currentWriterUpdate) {
      throw new Error(`Writer update not found: ${writerUpdateId}`);
    }

    // Fetch the checkpoint.
    this._checkpoint.value = await d.db.query.checkpoints.findFirst({
      where: currentWriterUpdate.checkpointId
        ? eq(d.checkpoints.id, currentWriterUpdate.checkpointId)
        : isNull(d.checkpoints.id),
    });
    console.debug("Checkpoint", this._checkpoint.value);
    if (!this._checkpoint.value) {
      throw new Error(
        `Checkpoint not found: ${currentWriterUpdate.checkpointId}`,
      );
    }

    // Fetch recent updates (including the current update)
    // along with their siblings and director updates.
    this._recentUpdates.value = await Promise.all(
      (
        await Simulation._fetchWriterUpdateAncestors(
          currentWriterUpdate.id,
          currentWriterUpdate.checkpointId,
        )
      )
        .reverse()
        .map((u) => this._createUpdate(u, true, true)),
    );

    // Fetch historical updates with siblings.
    const oldestRecentUpdate = this._recentUpdates.value.at(0);
    if (oldestRecentUpdate?.parentId) {
      this._historicalUpdates.value = await Promise.all(
        (
          await Simulation._fetchWriterUpdateAncestors(
            oldestRecentUpdate.parentId,
            undefined, // Any checkpoint.
            historicalUpdatesLimit,
          )
        )
          .reverse()
          .map((u) => this._createUpdate(u, true)),
      );
    } else {
      this._historicalUpdates.value = [];
    }

    // Fetch future updates with siblings.
    if (currentWriterUpdate.nextUpdateId) {
      this._futureUpdates.value = await Promise.all(
        (
          await Simulation._fetchWriterUpdateDescendants(
            currentWriterUpdate.nextUpdateId,
            historicalUpdatesLimit,
          )
        ).map((u) => this._createUpdate(u, true)),
      );
    } else {
      this._futureUpdates.value = [];
    }

    if (this.mode === Mode.Immersive) {
      // Set the state to the current update.
      this._resetStateToCurrentUpdate(newStateIncludesCurrentUpdate);
    }

    // Set simulation head to the new current update.
    await Simulation._updateSimulationHead(
      d.db,
      this.id,
      this.currentUpdate.value!.ensureChosenVariant.writerUpdate.id,
    );
  }

  /**
   * Hard-reset the state to current checkpoint, and apply
   * all recent director updates up to the current update.
   *
   * @param includeCurrentUpdate If true, would include the current update's code.
   * Otherwise, the resulting state would be equal to {@link _previousState}.
   */
  private _resetStateToCurrentUpdate(includeCurrentUpdate: boolean) {
    if (!this.state) {
      throw new Bug("State is not initialized (_resetStateToCurrentUpdate)");
    }

    // Reset the state to the checkpoint.
    this.state.setState(this._checkpoint.value!.state!);

    // Apply existing director updates to the stage, from oldest to newest.
    //

    let i = 0;
    while (
      i <
      this._recentUpdates.value.length - (includeCurrentUpdate ? 0 : 1)
    ) {
      if (
        i ===
        (this._recentUpdates.value.length > 1
          ? this._recentUpdates.value.length - 1
          : 0)
      ) {
        this._dumpCurrentState();
      }

      const update = this._recentUpdates.value[i];
      // console.debug("Applying update", update.chosenVariant?.writerUpdate.text);
      const directorUpdate = update.chosenVariant?.directorUpdate;

      if (directorUpdate) {
        console.debug("Applying stage code", directorUpdate.code);
        this.state.apply(directorUpdate.code);
      } else {
        // console.debug("No director update to apply");
      }

      i++;
    }

    console.debug("Initialized state", this.state.serialize());
  }

  /**
   * Set {@link _previousState} to the current state snapshot.
   */
  private _dumpCurrentState() {
    if (!this.state) {
      throw new Bug("State is not initialized (_dumpCurrentState)");
    }

    this._previousState.value = this.state.serialize();
    console.debug("Saved previous state", this._previousState.value);
  }

  /**
   * Check the current state, and save it as a new director update if
   * it differs from the current update's applied director update
   * (e.g. the user has changed it from the sandbox console).
   */
  // TODO: Same applies to a user update, when it has code.
  private async _commitCurrentState() {
    if (!this.state) {
      throw new Bug("State is not initialized (_commitCurrentState)");
    }

    const update = this.currentUpdate.value;

    if (update) {
      const actualDelta = this.previousStateDelta.value ?? [];

      console.debug({
        previousState: this.previousState.value,
        state: this.state.serialize(),
        actualDelta,
        directorUpdate: update.chosenVariant?.directorUpdate?.code,
      });

      const deltasEqual = update.chosenVariant?.directorUpdate
        ? compareStateDeltas(
            this.state.serialize(),
            actualDelta,
            update.chosenVariant.directorUpdate.code,
          )
        : actualDelta.length === 0;
      console.log("Deltas equal?", deltasEqual);

      if (!deltasEqual) {
        console.log(
          "Saving actual delta as a new director update",
          actualDelta,
        );

        const directorUpdate = (
          await d.db
            .insert(d.directorUpdates)
            .values({
              writerUpdateId: update.ensureChosenVariant.writerUpdate.id,
              code: actualDelta,
              preference: true, // Because these are manual changes.
            })
            .returning()
        )[0];

        update.ensureChosenVariant.directorUpdate = directorUpdate;
        update.ensureChosenVariant.state = this.state.serialize();
      }
    }
  }

  /**
   * @private
   * Save updates to the database.
   */
  static async _saveUpdatesToDb(
    simulationId: number,
    updates: {
      writerUpdate: {
        parentUpdateId: number | undefined | null;
        checkpointId: number;
        didConsolidate?: boolean;
        characterId?: string | null;
        simulationDayClock: number;
        text: string;
        llmCompletionId?: number | null;
      } & (
        | {
            episodeId: string;
            episodeChunkIndex: number;
          }
        | {
            createdByPlayer: true;
          }
        | {}
      );
      directorUpdate?: {
        llmCompletionId?: number | null;
        code: StateCommand[];
      };
    },
  ) {
    return d.db.transaction(async (tx) => {
      // Insert the writer update.
      const childWriterUpdate = (
        await tx
          .insert(d.writerUpdates)
          .values({
            simulationId,
            ...updates.writerUpdate,
          })
          .returning()
      )[0];

      // Insert the director update if needed.
      let directorUpdate;
      if (updates.directorUpdate) {
        directorUpdate = (
          await tx
            .insert(d.directorUpdates)
            .values({
              writerUpdateId: childWriterUpdate.id,
              ...updates.directorUpdate,
            })
            .returning()
        )[0];
      }

      // Update the parent writer update's next update ID.
      if (updates.writerUpdate.parentUpdateId) {
        await tx
          .update(d.writerUpdates)
          .set({ nextUpdateId: childWriterUpdate.id })
          .where(eq(d.writerUpdates.id, updates.writerUpdate.parentUpdateId));
      }

      // Update the simulation's current update ID.
      await Simulation._updateSimulationHead(
        tx,
        simulationId,
        childWriterUpdate.id,
      );

      return { writerUpdate: childWriterUpdate, directorUpdate };
    });
  }

  /**
   * Infer a new assistant update variant.
   */
  private async _inferUpdateVariantImpl(
    update: Update,
    recentUpdates: Update[],
    writerParams: {
      nEval: number;
      predictionOptions?: WriterPredictionOptions;
      inferenceOptions?: CompletionOptions;
    },
    abortSignal?: AbortSignal,
  ): Promise<{
    characterId: string | null;
    text: string;
  }> {
    try {
      this._currentJob.value = markRaw(
        new PredictUpdateVariantJob(
          this.id,
          this.scenario,
          this.mode,
          {
            writer: this.writer,
            director: this.director,
            voicer: this.voicer,
          },
          this._checkpoint.value!,
          this.state,
          update,
          this._historicalUpdates.value,
          recentUpdates,
          writerParams,
        ),
      );

      return await this._currentJob.value.run(abortSignal);
    } finally {
      this._currentJob.value = null;
    }
  }

  //
  //#endregion
}

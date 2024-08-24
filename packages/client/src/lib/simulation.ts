import { watchImmediate } from "@vueuse/core";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { toMinutes } from "duration-fns";
import pRetry from "p-retry";
import {
  computed,
  markRaw,
  readonly,
  ref,
  shallowRef,
  triggerRef,
  type Raw,
  type ShallowRef,
} from "vue";
import {
  CompletionAbortError,
  type BaseLlmDriver,
  type CompletionOptions,
} from "./ai/llm/BaseLlmDriver";
import { RemoteLlmDriver } from "./ai/llm/RemoteLlmDriver";
import { TauriLlmDriver } from "./ai/llm/TauriLlmDriver";
import { RemoteTtsDriver } from "./ai/tts/RemoteTtsDriver";
import { d, parseSelectResult, sqlite, type Transaction } from "./drizzle";
import { writerUpdatesTableName } from "./drizzle/schema";
import * as resources from "./resources";
import {
  Director,
  PredictionError,
  type SimpleUpdate,
} from "./simulation/agents/director";
import { Voicer } from "./simulation/agents/voicer";
import type { VoicerJob } from "./simulation/agents/voicer/job";
import {
  Writer,
  type VisualizationOptions,
  type PredictionOptions as WriterPredictionOptions,
} from "./simulation/agents/writer";
import { Scenario, ensureReadScenario } from "./simulation/scenario";
import { type StageRenderer } from "./simulation/stageRenderer";
import {
  State,
  applyCommandsToStateDtoUnsafe,
  compareStateDeltas,
  type StateDto,
} from "./simulation/state";
import { type StateCommand } from "./simulation/state/commands";
import { Update } from "./simulation/update";
import * as storage from "./storage";
import type { LlmAgentId } from "./storage/llm";
import { assert, assertCallback, clone, unreachable } from "./utils";

export { Scenario, State };

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
  private _director: Director;
  private _voicer: Voicer;

  private _writerDone = ref<boolean | undefined>();
  private _directorDone = ref<boolean | undefined>();
  private _voicerJob = shallowRef<VoicerJob | null | undefined>();
  //#endregion

  readonly state: State;

  /**
   * The simulation ID.
   */
  readonly id: string;

  /**
   * The scenario ID.
   */
  readonly scenarioId: string;

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
   * Whether the simulation can load more future updates.
   */
  readonly canLoadMoreFutureUpdates = computed(() => {
    const nextUpdateId = (
      this._futureUpdates.value.length
        ? this._futureUpdates.value
        : this._recentUpdates.value
    ).at(-1)?.chosenVariant?.writerUpdate.nextUpdateId;

    return typeof nextUpdateId === "string";
  });

  /**
   * A condition that allows creating a new user update.
   */
  readonly canCreateUserUpdate = computed(() => {
    return !this.busy.value && !this.state.shallAdvanceEpisode.value;
  });

  /**
   * The writer instance.
   */
  get writer() {
    return this._writer;
  }

  /**
   * Whether the writer agent is done for the current job.
   */
  readonly writerDone = readonly(this._writerDone);

  /**
   * The director instance.
   */
  get director() {
    return this._director;
  }

  /**
   * Whether the director agent is done for the current job.
   */
  readonly directorDone = readonly(this._directorDone);

  /**
   * The voicer instance.
   */
  get voicer() {
    return this._voicer;
  }

  /**
   * Whether the voicer agent is done for the current job.
   */
  readonly voicerJob = readonly(this._voicerJob);

  /**
   * Whether the simulation is busy.
   */
  readonly busy = readonly(this._busy);

  readonly previousState = computed(() => this._previousState.value);

  readonly previousStateDelta = computed(() => {
    return this._previousState.value
      ? State.delta(this.state.serialize(), this._previousState.value)
      : null;
  });

  readonly ready = computed(() => this.writer.ready.value);

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
    this.state.connectStageRenderer(scene);
  }

  /**
   * Create a new simulation.
   */
  static async create(scenarioId: string, episodeId?: string) {
    const scenario = await ensureReadScenario(scenarioId);
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
            state: startingEpisode.initialCheckpoint.state,
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

      if (chunk.directorUpdate) {
        await tx.insert(d.directorUpdates).values({
          writerUpdateId: writerUpdate.id,
          code: chunk.directorUpdate,
        });
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
  static async load(simulationId: string): Promise<Simulation> {
    const simulation = await d.db.query.simulations.findFirst({
      where: eq(d.simulations.id, simulationId),
    });

    if (!simulation) {
      throw new Error(`Simulation not found with ID ${simulationId}`);
    } else {
      console.debug("Found simulation", simulation);
    }

    const scenario = await ensureReadScenario(simulation.scenarioId);

    const instance = new Simulation(
      simulationId,
      simulation.scenarioId,
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
  async advanceCurrentEpisode() {
    if (this.busy.value) {
      throw new Error("Simulation is busy");
    }

    if (!this.state.currentEpisode.value) {
      throw new Error("No episode to advance");
    }

    if (!this.state.shallAdvanceEpisode.value) {
      throw new Error("Cannot advance the episode any further");
    }

    this._busy.value = true;
    try {
      const { episodeId, chunkIndex, writerUpdate, directorUpdate } =
        await this.state.advanceCurrentEpisode();

      this._dumpCurrentState();

      const parentUpdateId =
        this.currentUpdate.value?.chosenVariant?.writerUpdate.id;
      console.debug("Parent update ID", parentUpdateId);

      const incoming = await this._saveUpdatesToDb({
        writerUpdate: {
          parentUpdateId,
          checkpointId: this._checkpoint.value!.id,
          characterId: writerUpdate.characterId,
          simulationDayClock: toMinutes({
            hours: writerUpdate.clock.hours,
            minutes: writerUpdate.clock.minutes,
          }),
          text: writerUpdate.text,
          episodeId,
          episodeChunkIndex: chunkIndex,
        },
        directorUpdate: directorUpdate ? { code: directorUpdate } : undefined,
      });

      // Add the new episode update to the recent updates.
      const episodeUpdate = markRaw(
        new Update(
          parentUpdateId,
          shallowRef([{ ...incoming, state: this.state.serialize() }]),
        ),
      );
      this._recentUpdates.value.push(episodeUpdate);
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

    if (this.state.shallAdvanceEpisode.value) {
      /** Call {@link advanceCurrentEpisode} instead. */
      throw new Error("Cannot create an update during an episode");
    }

    this._busy.value = true;
    try {
      await this._commitCurrentState();
      this._dumpCurrentState();

      const parentWriterUpdate =
        this.currentUpdate.value?.chosenVariant?.writerUpdate;
      const parentUpdateId = parentWriterUpdate?.id;

      // Insert the new writer update to the database.
      let saved = await this._saveUpdatesToDb({
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
        update.variants.value.push({ ...saved, state: this.state.serialize() });
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
            shallowRef([{ ...saved, state: this.state.serialize() }]),
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
   * @assert There is no current episode.
   * @assert Can not go forward.
   */
  async predictUpdate(
    nEval: number,
    predictionOptions?: WriterPredictionOptions,
    inferenceOptions?: CompletionOptions,
    onDecodeProgress?: (event: { progress: number }) => void,
    inferenceAbortSignal?: AbortSignal,
  ) {
    if (this.busy.value) {
      throw new Error("Simulation is busy");
    }

    if (this.state.shallAdvanceEpisode.value) {
      throw new Error("Cannot create assistant update during an episode");
    }

    if (this.canGoForward.value) {
      throw new Error(
        "Cannot predict the next update if there are future updates",
      );
    }

    if (!this.writer.ready.value) {
      throw new Error("Writer is not ready");
    }

    if (!this.director.ready.value) {
      throw new Error("Director is not ready");
    }

    this._busy.value = true;
    try {
      await this._commitCurrentState();
      this._dumpCurrentState();

      const update = markRaw(
        new Update(this.currentUpdate.value?.chosenVariant?.writerUpdate.id),
      );

      this._recentUpdates.value.push(update);

      await this._inferUpdateVariantImpl(
        update,
        this._recentUpdates.value.slice(0, -1), // Skip the just created update.
        nEval,
        predictionOptions,
        inferenceOptions,
        onDecodeProgress,
        inferenceAbortSignal,
      );
      if (inferenceAbortSignal?.aborted) {
        console.warn("Writer inference aborted");
        return;
      }
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
  async createCurrentUpdateVariant(
    nEval: number,
    predictionOptions?: WriterPredictionOptions,
    inferenceOptions?: CompletionOptions,
    onInferenceDecodingProgress?: (event: { progress: number }) => void,
    inferenceAbortSignal?: AbortSignal,
  ) {
    if (this.busy.value) {
      throw new Error("Cannot regenerate while busy");
    }

    if (!this.currentUpdate.value) {
      throw new Error("No current update");
    }

    if (!this._previousState.value) {
      throw new Error("[BUG] No previous state to reset to");
    }

    this._busy.value = true;
    try {
      // Clear the future updates.
      this._futureUpdates.value = [];

      // Reset the state to the previous one.
      await this._commitCurrentState();
      this.state.setState(this._previousState.value);
      console.debug("State after reset", this.state.serialize());

      // Infer the new variant.
      await this._inferUpdateVariantImpl(
        this.currentUpdate.value,
        this._recentUpdates.value.slice(0, -1), // Skip the current update.
        nEval,
        predictionOptions,
        inferenceOptions,
        onInferenceDecodingProgress,
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

    if (!this._previousState.value) {
      throw new Error("[BUG] No previous state to reset to");
    }

    await this._commitCurrentState();

    currentUpdate.chosenVariantIndex.value = variantIndex;
    const newVariant = currentUpdate.ensureChosenVariant;

    // Synchronize the state with the chosen variant.
    this.state.setState(this._previousState.value);
    if (newVariant.directorUpdate === undefined) {
      console.debug("Fetching applied director update for the chosen variant");
      newVariant.directorUpdate = await Simulation._fetchAppliedDirectorUpdate(
        newVariant.writerUpdate.id,
      );
    }
    const code = newVariant.directorUpdate?.code;
    if (code) {
      console.debug("Applying director update code", code);
      this.state.apply(code);
    }

    // Fetch new future updates.
    this._futureUpdates.value = newVariant.writerUpdate.nextUpdateId
      ? await Simulation._fetchWriterUpdateDescendants(
          newVariant.writerUpdate.nextUpdateId,
        ).then((updates) =>
          Promise.all(updates.map((u) => Simulation._createUpdate(u, true))),
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
   * If the consoldation is not possible, returns a `Error` instance.
   *
   * @assert The simulation is not busy.
   * @assert There is a current update.
   * @assert There is no active episode.
   * @assert There are no future updates.
   */
  readonly consolidationPreliminaryError = computed(() => {
    if (this.busy.value) {
      return new Error("Simulation is busy");
    }

    if (!this.writer.ready.value) {
      return new Error("Writer is not ready");
    }

    if (this.state.shallAdvanceEpisode.value) {
      return new Error("Cannot consolidate during an episode");
    }

    const writerUpdate = this.currentUpdate.value?.chosenVariant?.writerUpdate;
    if (!writerUpdate) {
      return new Error("No current update");
    }

    if (writerUpdate.didConsolidate) {
      return new Error("Update is already consolidated");
    }
  });

  /**
   * Whether the simulation can be consolidated.
   * @see {@link consolidationPreliminaryError}.
   */
  readonly canConsolidate = computed(
    () => !this.consolidationPreliminaryError.value,
  );

  /**
   * Consolidate the simulation at the current update.
   * @throws If {@link canConsolidate} is false.
   */
  async consolidate(inferenceAbortSignal?: AbortSignal) {
    if (this.consolidationPreliminaryError.value) {
      throw this.consolidationPreliminaryError.value;
    }

    if (!this.writer.ready.value) {
      return new Error("Writer is not ready");
    }

    const writerUpdate = this.currentUpdate.value?.chosenVariant?.writerUpdate;
    if (!writerUpdate) {
      throw new Error("No current update");
    }

    this._busy.value = true;
    this._consolidationInProgress.value = true;
    try {
      const summarizationResult = await this.writer.summarize(
        this._checkpoint.value!,
        this._historicalUpdates.value,
        this._recentUpdates.value,
        this.state.serialize(),
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
              state: this.state.serialize(),
            })
            .onConflictDoUpdate({
              set: { summary: summarizationResult.newSummary },
              target: [
                d.checkpoints.simulationId,
                d.checkpoints.writerUpdateId,
              ],
            })
            .returning()
        )[0];

        // Update the writer update.
        await tx
          .update(d.writerUpdates)
          .set({ didConsolidate: true })
          .where(eq(d.writerUpdates.id, writerUpdate.id));

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
      Promise.all(
        updates.reverse().map((u) => Simulation._createUpdate(u, true)),
      ),
    );

    this._historicalUpdates.value.unshift(...updates);
  }

  /**
   * Go back to the previous (older) update.
   * Always requires fading due to hard state reset.
   */
  async goBack() {
    if (!this.canGoBack.value) throw new Error("Cannot go back");

    await this._commitCurrentState();

    if (this._recentUpdates.value.length > 1) {
      console.debug("Going back to the previous recent update");

      // Simply move one recent update back.
      this._futureUpdates.value.unshift(this._recentUpdates.value.pop()!);

      // NOTE: Would need to set pre-previous state, therefore simple
      // `this.state.setState(this._previousState.value)` is not enough.
      this._resetStateToCurrentUpdate(true);
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

    await this._commitCurrentState();

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

      // NOTE: Would need to set pre-previous state, therefore simple
      // `this.state.setState(this._previousState.value)` is not enough.
      this._resetStateToCurrentUpdate(newStateIncludesCurrentUpdate);

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
          .then((writerUpdate) =>
            Simulation._createUpdate(writerUpdate, true, true),
          )
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

    await this._commitCurrentState();
    this._dumpCurrentState();

    this._recentUpdates.value.push(nextCurrentUpdate);

    const variant = nextCurrentUpdate.chosenVariant;
    if (!variant) throw new Error("BUG: No chosen variant");

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
      console.debug("State after applying stage code", this.state.serialize());
    } else {
      console.debug("No director update to apply");
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
    if (!this.canLoadMoreFutureUpdates.value) {
      throw new Error("Cannot load more future updates");
    }

    const nextUpdateId =
      this._futureUpdates.value.at(-1)!.ensureChosenVariant.writerUpdate
        .nextUpdateId!;

    const updates = await Simulation._fetchWriterUpdateDescendants(
      nextUpdateId,
      limit,
    ).then((updates) =>
      Promise.all(updates.map((u) => Simulation._createUpdate(u, true))),
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
      this.state.serialize(),
      nEval,
      visualizationOptions,
      completionOptions,
      abortSignal,
    );
  }

  destroy() {
    this._writer.llmDriver.value?.destroy();
    storage.llm.useLatestSession("writer").value = null;

    this._director.llmDriver.value?.destroy();
    storage.llm.useLatestSession("director").value = null;
  }

  //#region Private methods
  //

  /**
   * Fetch the ancestor updates recursively: the first update will be the one
   * with ID `descendantUpdateId`, followed by its ancestor, and so on.
   *
   * @param descendantUpdateId The first update ID to fetch.
   * @param checkpointId If set, would only fetch updates with the specified checkpoint.
   * @param limit If set, would limit the depth of the fetched updates.
   */
  private static async _fetchWriterUpdateAncestors(
    descendantUpdateId: string,
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
    nextUpdateId: string,
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
   * Fetch the applied (i.e. latest) director update for a writer update.
   */
  private static async _fetchAppliedDirectorUpdate(writerUpdateId: string) {
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
  private static async _createUpdate(
    writerUpdate: typeof d.writerUpdates.$inferSelect & {
      completion?: typeof d.llmCompletions.$inferSelect | null;
    },
    fetchSiblings = false,
    fetchAppliedDirectorUpdate = false,
  ): Promise<Update> {
    const siblings = fetchSiblings
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

    let directorUpdate = fetchAppliedDirectorUpdate
      ? await Simulation._fetchAppliedDirectorUpdate(writerUpdate.id)
      : undefined;

    const update = markRaw(
      new Update(
        writerUpdate.parentUpdateId,
        shallowRef(
          siblings.map((sibling) => ({
            writerUpdate: sibling,
          })),
        ),
      ),
    );

    update.chosenVariantIndex.value = assertCallback(
      update.variants.value.findIndex(
        (v) => v.writerUpdate.id === writerUpdate.id,
      ),
      (index) => index >= 0,
      "BUG: Chosen variant not found in siblings",
    );

    update.ensureChosenVariant.directorUpdate = directorUpdate;

    return update;
  }

  /**
   * Set simulation current (head) writer update ID to `writerUpdateId`.
   */
  private static async _updateSimulationHead(
    tx: Transaction | typeof d.db = d.db,
    simulationId: string,
    writerUpdateId: string,
  ) {
    return tx
      .update(d.simulations)
      .set({
        currentUpdateId: writerUpdateId,
        updatedAt: sql`CURRENT_TIMESTAMP`,
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

  private constructor(id: string, scenarioId: string, scenario: Scenario) {
    this.id = id;
    this.scenarioId = scenarioId;
    this.scenario = scenario;
    this.state = new State(scenario);
    this._writer = new Writer(null, this.scenario);
    this._director = new Director(null, this.scenario);
    this._voicer = new Voicer(null, this.scenario);
  }

  /**
   * Wait until the simulation is initialized.
   * Triggers writer initialization in the background.
   */
  private async _init(currentWriterUpdateId: string | null) {
    await this.state.initCodeEngine();

    if (currentWriterUpdateId) {
      await this._jumpToId(currentWriterUpdateId);
    }

    this._initWriter();
    this._initDirector();
    this._initVoicer();
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
    writerUpdateId: string,
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
        .map((u) => Simulation._createUpdate(u, true, true)),
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
          .map((u) => Simulation._createUpdate(u, true)),
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
        ).map((u) => Simulation._createUpdate(u, true)),
      );
    } else {
      this._futureUpdates.value = [];
    }

    // Set the state to the current update.
    this._resetStateToCurrentUpdate(newStateIncludesCurrentUpdate);

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
    // Reset the state to the checkpoint.
    this.state.setState(this._checkpoint.value!.state);

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
      console.debug("Applying update", update.chosenVariant?.writerUpdate.text);
      const directorUpdate = update.chosenVariant?.directorUpdate;

      if (directorUpdate) {
        console.debug("Applying stage code", directorUpdate.code);
        this.state.apply(directorUpdate.code);
      } else {
        console.debug("No director update to apply");
      }

      i++;
    }

    // Set the current episode if needed.
    // TODO: Use state-only episode tracking.
    const currentVariant = this.currentUpdate.value?.chosenVariant;
    if (currentVariant?.writerUpdate.episodeId) {
      this.state.setEpisode(
        currentVariant.writerUpdate.episodeId!,
        currentVariant.writerUpdate.episodeChunkIndex! + 1,
      );
    }

    console.debug("Initialized state", this.state.serialize());
  }

  private async _initLlmAgent(
    agent: LlmAgentId,
    driverRef: ShallowRef<BaseLlmDriver | null>,
    initialPromptBuilder: () => string,
  ) {
    const driverConfig = storage.llm.useDriverConfig(agent);
    const latestSession = storage.llm.useLatestSession(agent);

    watchImmediate(
      () => driverConfig.value,
      async (driverConfig) => {
        console.debug("Driver config watch trigger", agent, driverConfig);

        if (driverConfig) {
          if (driverRef.value) {
            console.debug("Comparing driver configs.", agent, {
              other: driverConfig,
            });
            if (!driverRef.value.compareConfig(driverConfig)) {
              console.log(
                "Driver config is different, destroying the driver.",
                agent,
              );
              driverRef.value.destroy();
              driverRef.value = null;
              latestSession.value = null;
            } else {
              console.debug("Driver config is the same.", agent);
              return;
            }
          }

          switch (driverConfig.type) {
            case "local": {
              let driver: TauriLlmDriver | null = null;

              if (latestSession.value?.driver === "local") {
                driver = await TauriLlmDriver.find(
                  latestSession.value.id,
                  driverConfig,
                );
              }

              if (!driver) {
                console.log("Creating new TauriLlmDriver", agent, driverConfig);

                const initialPrompt = initialPromptBuilder();

                driver = TauriLlmDriver.create(
                  driverConfig,
                  initialPrompt,
                  true,
                  ({ databaseSessionId }) => {
                    latestSession.value = {
                      driver: "local",
                      id: databaseSessionId,
                    };
                  },
                );
              } else {
                console.log(`Restored TauriLlmDriver`, {
                  agent,
                  latestSession: latestSession.value,
                  driverConfig,
                });
              }

              driverRef.value = driver;
              break;
            }

            case "remote": {
              console.log("Creating new RemoteLlmDriver", {
                agent,
                driverConfig,
                latestSession: latestSession.value,
              });

              driverRef.value = await RemoteLlmDriver.create(
                driverConfig,
                latestSession,
                storage.remoteServerJwt,
              );

              break;
            }

            default:
              throw unreachable(driverConfig);
          }
        } else {
          // New driver config is empty.
          // Destroy the driver instance if it exists.
          if (driverRef.value) {
            driverRef.value.destroy();
            driverRef.value = null;
          }
        }
      },
    );
  }

  /**
   * Prepare writer for the simulation.
   */
  private async _initWriter() {
    return this._initLlmAgent("writer", this._writer.llmDriver, () =>
      Writer.buildStaticPrompt(this.scenario),
    );
  }

  /**
   * Prepare director for the simulation.
   */
  private async _initDirector() {
    return this._initLlmAgent("director", this._director.llmDriver, () =>
      Director.buildStaticPrompt(this.scenario),
    );
  }

  /**
   * Prepare voicer for the simulation.
   */
  private async _initVoicer() {
    const driverRef = this._voicer.ttsDriver;
    const agent = "voicer";

    watchImmediate(
      () => storage.tts.ttsConfig.value,
      async (ttsConfig) => {
        console.debug("Driver config watch trigger", agent, ttsConfig);
        const driverConfig = ttsConfig?.driver;

        if (ttsConfig?.enabled && driverConfig) {
          if (driverRef.value) {
            console.debug("Comparing driver configs.", agent, {
              other: driverConfig,
            });

            if (!driverRef.value.compareConfig(driverConfig)) {
              console.log(
                "Driver config is different, destroying the driver.",
                agent,
              );

              driverRef.value.destroy();
              driverRef.value = null;
            } else {
              console.debug("Driver config is the same.", agent);
              return;
            }
          }

          switch (driverConfig.type) {
            case "remote": {
              console.log("Creating new RemoteTtsDriver", {
                driverConfig,
              });

              driverRef.value = new RemoteTtsDriver(
                driverConfig,
                storage.remoteServerJwt,
              );

              break;
            }

            default:
              throw unreachable(driverConfig.type);
          }
        } else {
          // New driver config is empty, or TTS is disabled.
          // Destroy the driver instance if it exists.
          if (driverRef.value) {
            driverRef.value.destroy();
            driverRef.value = null;
          }
        }
      },
    );
  }

  /**
   * Set {@link _previousState} to the current state snapshot.
   */
  private _dumpCurrentState() {
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
   * Save updates to the database.
   */
  private async _saveUpdatesToDb(updates: {
    writerUpdate: {
      parentUpdateId: string | undefined | null;
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
  }) {
    return d.db.transaction(async (tx) => {
      // Insert the writer update.
      const childWriterUpdate = (
        await tx
          .insert(d.writerUpdates)
          .values({
            simulationId: this.id,
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
      await Simulation._updateSimulationHead(tx, this.id, childWriterUpdate.id);

      return { writerUpdate: childWriterUpdate, directorUpdate };
    });
  }

  /**
   * For a linear list of updates, ensure that all of them have their state set.
   */
  private async _ensureUpdateStates(updates: Update[]) {
    if (!updates.length) {
      console.warn("No updates to ensure states for");
      return;
    }

    console.debug(
      "Earliest update to ensure state for",
      updates[0].ensureChosenVariant.writerUpdate,
    );

    let currentCheckpoint;
    if (
      updates[0].ensureChosenVariant.writerUpdate.checkpointId ===
      this._checkpoint.value!.id
    ) {
      console.debug("Using current checkpoint for state ensuring");
      currentCheckpoint = this._checkpoint.value!;
    } else {
      console.debug("Fetching checkpoint for state ensuring", {
        checkpointId: updates[0].ensureChosenVariant.writerUpdate.checkpointId,
      });

      currentCheckpoint = await d.db.query.checkpoints.findFirst({
        where: eq(
          d.checkpoints.id,
          updates[0].ensureChosenVariant.writerUpdate.checkpointId,
        ),
      });

      if (!currentCheckpoint) {
        throw new Error(
          `Checkpoint not found: ${updates[0].ensureChosenVariant.writerUpdate.checkpointId}`,
        );
      }
    }

    console.debug("Current checkpoint for ensuring", currentCheckpoint);
    let currentState = clone(currentCheckpoint.state);
    console.debug("Current state for ensuring", JSON.stringify(currentState));

    if (
      currentCheckpoint.writerUpdateId !==
      updates[0].ensureChosenVariant.writerUpdate.id
    ) {
      console.debug("Fetching earlier updates", {
        checkpointId: currentCheckpoint.id,
        currentCheckpointWriterUpdateId: currentCheckpoint.writerUpdateId,
        untilUpdate: updates[0].ensureChosenVariant.writerUpdate.id,
      });

      const earlierUpdates = (
        await Simulation._fetchWriterUpdateAncestors(
          updates[0].ensureChosenVariant.writerUpdate.id,
          currentCheckpoint.id,
        )
      ).reverse();
      console.debug("Fetched earlier updates", earlierUpdates.length);

      for (const earlierUpdate of earlierUpdates) {
        if (
          earlierUpdate.id === updates[0].ensureChosenVariant.writerUpdate.id
        ) {
          console.debug("Skipping the update itself", earlierUpdate.id);
          continue;
        }

        const directorUpdate = await Simulation._fetchAppliedDirectorUpdate(
          earlierUpdate.id,
        );

        if (directorUpdate) {
          applyCommandsToStateDtoUnsafe(currentState, directorUpdate.code);
        }

        console.debug("Current state after applying earlier update", {
          writerUpdateId: earlierUpdate.id,
          text: earlierUpdate.text,
          state: clone(currentState),
        });
      }
    }

    for (const update of updates) {
      if (update.ensureChosenVariant.state) {
        console.debug("State already ensured for", {
          writerUpdateId: update.ensureChosenVariant.writerUpdate.id,
          text: update.ensureChosenVariant.writerUpdate.text,
        });

        currentState = clone(update.ensureChosenVariant.state);
        continue;
      }

      if (update.ensureChosenVariant.directorUpdate === undefined) {
        console.debug(
          "Fetching missing director update for",
          update.ensureChosenVariant.writerUpdate.id,
        );

        update.ensureChosenVariant.directorUpdate =
          await Simulation._fetchAppliedDirectorUpdate(
            update.ensureChosenVariant.writerUpdate.id,
          );
      }

      if (update.ensureChosenVariant.directorUpdate) {
        applyCommandsToStateDtoUnsafe(
          currentState,
          update.ensureChosenVariant.directorUpdate.code,
        );
      }

      update.ensureChosenVariant.state = clone(currentState);

      console.debug("Ensured state for", {
        writerUpdateId: update.ensureChosenVariant.writerUpdate.id,
        text: update.ensureChosenVariant.writerUpdate.text,
        state: clone(currentState),
      });
    }
  }

  private async _inferDirectorUpdate(
    incomingWriterUpdate:
      | {
          characterId: string | null;
          text: string;
        }
      | undefined,
    inferenceAbortSignal?: AbortSignal,
  ) {
    // The logic here is to iterate through the updates in reverse order,
    // putting those having null director update into the incoming updates,
    // otherwise into the historical updates. Would stop when the limit is reached.
    // Also, we only enrich incoming updates until we meet the first
    // historical update (i.e. with a director update set).
    //

    const incomingUpdates: SimpleUpdate[] = [];

    if (incomingWriterUpdate) {
      incomingUpdates.push(incomingWriterUpdate);
    }

    const maxHistoricalUpdates = 10;
    const historicalUpdates: Update[] = [];

    for (
      let i = this.updates.value.length - 2;
      i >= 0 && historicalUpdates.length < maxHistoricalUpdates;
      i--
    ) {
      const variant = this.updates.value[i].ensureChosenVariant;

      if (variant.directorUpdate === undefined) {
        console.debug(
          "Fetching missing director update for",
          variant.writerUpdate.id,
        );

        variant.directorUpdate = await Simulation._fetchAppliedDirectorUpdate(
          variant.writerUpdate.id,
        );
      }

      if (historicalUpdates.length) {
        // We already have historical updates, so all the upcoming updates
        // are forced to be historical as well.
        historicalUpdates.unshift(this.updates.value[i]);
      } else if (variant.directorUpdate) {
        // This one has a director update, therefore
        // it belongs to the historical updates.
        historicalUpdates.unshift(this.updates.value[i]);
      } else {
        // We've confirmed that this update's director update
        // is null, so it goes to the incoming updates.
        incomingUpdates.unshift({
          characterId: variant.writerUpdate.characterId,
          text: variant.writerUpdate.text,
        });
      }
    }

    // Finally, ensure that all historical updates have their states set,
    // so that the director can serialize those states.
    await this._ensureUpdateStates(historicalUpdates);

    return this.director.inferUpdate(
      historicalUpdates.map((update) => {
        const variant = update.ensureChosenVariant;

        return {
          characterId: variant.writerUpdate.characterId,
          text: variant.writerUpdate.text,

          // That's what all that fuss was about.
          state: variant.directorUpdate?.code.length
            ? variant.state
            : undefined,
        };
      }),

      this.state.serialize(),
      incomingUpdates,

      256,
      { temp: 0.5 },
      (e) => {
        console.log(`Director decoding progress: ${e.progress}`);
      },
      undefined,
      inferenceAbortSignal,
    );
  }

  /**
   * Infer a new assistant update variant.
   *
   * @param prompt Inference prompt, sent as-is to writer.
   * @param characterId If set, would force the character (or narrator) to speak.
   *
   * @returns The generated text.
   */
  private async _inferUpdateVariantImpl(
    update: Update,
    recentUpdates: Update[],
    nEval: number,
    predictionOptions?: WriterPredictionOptions,
    inferenceOptions?: CompletionOptions,
    onWriterDecodeProgress?: (event: { progress: number }) => void,
    inferenceAbortSignal?: AbortSignal,
  ): Promise<{
    characterId: string | null;
    text: string;
  }> {
    if (!this.writer.ready.value) {
      throw new Error("Writer is not ready");
    }

    update.inProgressVariant.value = {
      characterId: undefined,
      clockString: undefined,
      text: "",
    };

    try {
      this._writerDone.value = false;
      this._directorDone.value = false;

      const writerResponse = await this.writer.inferUpdate(
        this._checkpoint.value!,
        this._historicalUpdates.value,
        recentUpdates,
        this.state.serialize(),
        nEval,
        predictionOptions,
        inferenceOptions,
        onWriterDecodeProgress,
        (e) => {
          update.inProgressVariant.value!.text += e.content;
        },
        inferenceAbortSignal,
      );

      console.log("Predicted writer update", writerResponse);
      this._writerDone.value = true;
      // TODO: Check if abort signal was triggered.

      let doTts = false;
      if (
        this._voicer.ttsDriver.value &&
        storage.tts.ttsConfig.value?.enabled
      ) {
        switch (writerResponse.characterId) {
          // Narrator.
          case null:
            if (storage.tts.ttsConfig.value.narrator) doTts = true;
            break;

          // Main character.
          case this.scenario.defaultCharacterId:
            if (storage.tts.ttsConfig.value.mainCharacter) doTts = true;
            break;

          // Other characters.
          default:
            if (storage.tts.ttsConfig.value.otherCharacters) doTts = true;
            break;
        }
      }

      if (doTts) {
        console.debug("Creating TTS job");
        this._voicerJob.value = markRaw(
          this._voicer.createTtsJob(
            writerResponse.characterId,
            writerResponse.text,
          ),
        );
      } else {
        // No TTS, so we're done.
        this._voicerJob.value = null;
      }

      const directorResponse = await pRetry(
        async () => {
          const directorResponse = await this._inferDirectorUpdate(
            writerResponse,
            inferenceAbortSignal,
          );

          console.log("Predicted director update", directorResponse);

          if ("error" in directorResponse) {
            throw directorResponse.error;
          }

          return directorResponse;
        },
        {
          retries: 2,
          onFailedAttempt: (error) => {
            if (error instanceof PredictionError) {
              console.warn("Failed to infer director update", error);
            } else {
              throw error;
            }
          },
        },
      );
      this._directorDone.value = true;

      const { writerUpdate, directorUpdate } = await this._saveUpdatesToDb({
        writerUpdate: {
          parentUpdateId: update.parentId,
          checkpointId: this._checkpoint.value!.id,
          characterId: writerResponse.characterId,
          simulationDayClock: writerResponse.simulationDayClock,
          text: writerResponse.text,
          llmCompletionId: writerResponse.completion.id,
        },

        directorUpdate: {
          code: directorResponse.delta,
          llmCompletionId: directorResponse.completion?.id,
        },
      });

      let ttsAudioElement: HTMLAudioElement | undefined;
      if (this.voicerJob.value) {
        console.log("Waiting for TTS job to finish");
        const result = await this.voicerJob.value.result.promise;

        if (result instanceof Error) {
          console.error("TTS job failed", result);
        } else {
          console.debug("Saving TTS audio");
          await resources.tts.saveAudio(
            this.id,
            writerUpdate.id,
            result,
            ".wav",
          );

          ttsAudioElement = new Audio(
            URL.createObjectURL(new Blob([result], { type: "audio/wav" })),
          );
        }
      }

      if (directorUpdate?.code.length) {
        console.log("Applying stage code", directorUpdate.code);
        this.state.apply(directorUpdate.code);
      }

      update.variants.value.push({
        writerUpdate: {
          ...writerUpdate,
          completion: writerResponse.completion,
        },
        directorUpdate: directorUpdate,
        state: this.state.serialize(),
        ttsAudioElement,
      });

      update.setChosenVariantToLast();

      // ADHOC: Play the TTS audio now.
      if (ttsAudioElement) {
        const watchStopHandle = watchImmediate(
          () => storage.speechVolumeStorage.value,
          (volume) => {
            ttsAudioElement.volume = volume / 100;
          },
        );

        await ttsAudioElement.play();
        ttsAudioElement.onended = () => {
          watchStopHandle();
        };
      }

      return writerResponse;
    } finally {
      this._voicerJob.value = undefined;
      update.inProgressVariant.value = undefined;
      this._writerDone.value = undefined;
      this._directorDone.value = undefined;
    }
  }

  //
  //#endregion
}

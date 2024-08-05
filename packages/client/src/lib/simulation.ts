import * as settings from "@/settings";
import { latestDirectorSession, latestWriterSession } from "@/store";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { Raw, computed, markRaw, readonly, ref, shallowRef } from "vue";
import { d, parseSelectResult, sqlite } from "./drizzle";
import { writerUpdatesTableName } from "./drizzle/schema";
import { InferenceOptions } from "./simularity/common";
import { GptDriver, InferenceAbortError } from "./simularity/gpt";
import { Director } from "./simulation/agents/director";
import {
  Writer,
  PredictionOptions as WriterPredictionOptions,
} from "./simulation/agents/writer";
import { Scenario, ensureReadScenario } from "./simulation/scenario";
import { StageRenderer } from "./simulation/stageRenderer";
import { State, StateDto, comparesStateDeltas } from "./simulation/state";
import { StateCommand } from "./simulation/state/commands";
import { Update } from "./simulation/update";
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

  private _writer = shallowRef<Writer | undefined>();
  private _director = shallowRef<Director | undefined>();
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
  // TODO: Make it deferred back.
  readonly writer = computed(() => this._writer.value);

  /**
   * The director instance.
   */
  readonly director = computed(() => this._director.value);

  /**
   * Whether the simulation is busy.
   */
  readonly busy = readonly(this._busy);

  readonly previousStateDelta = computed(() => {
    return this._previousState.value
      ? this.state.delta(this._previousState.value)
      : null;
  });

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
      await tx
        .update(d.simulations)
        .set({ currentUpdateId: writerUpdate.id })
        .where(eq(d.simulations.id, simulation.id));

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
  async advanceCurrentEpisode(
    decodeProgressCallback: (event: { progress: number }) => void,
  ) {
    if (this.busy.value) {
      throw new Error("Simulation is busy");
    }

    if (!this.writer.value) {
      throw new Error("Writer is not initialized");
    }

    if (!this.state.currentEpisode.value) {
      throw new Error("No episode to advance");
    }

    if (!this.state.shallAdvanceEpisode.value) {
      throw new Error("Cannot advance the episode any further");
    }

    this._busy.value = true;
    try {
      await this._commitCurrentState();

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
          text: writerUpdate.text,
          episodeId,
          episodeChunkIndex: chunkIndex,
        },
        directorUpdate: directorUpdate ? { code: directorUpdate } : undefined,
      });

      // Add the new episode update to the recent updates.
      const episodeUpdate = markRaw(new Update(parentUpdateId, [incoming]));
      this._recentUpdates.value.push(episodeUpdate);

      // Decode the resulting prompt.
      this.writer.value.decodeFullPrompt(
        this._checkpoint.value!,
        this._historicalUpdates.value,
        this._recentUpdates.value,
        decodeProgressCallback,
      );
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

      const parentUpdateId =
        this.currentUpdate.value?.chosenVariant?.writerUpdate.id;

      // Insert the new writer update to the database.
      let saved = await this._saveUpdatesToDb({
        writerUpdate: {
          parentUpdateId,
          checkpointId: this._checkpoint.value!.id,
          characterId,
          text,
          createdByPlayer: true,
        },
      });

      if (this._futureUpdates.value.length) {
        // Add a new variant to the existing next update.
        const update = this._futureUpdates.value.shift()!;
        update.variants.push(saved);
        update.setChosenVariantToLast();

        // Shift the future update to the recent updates.
        this._recentUpdates.value.push(update);

        // Clear the future updates.
        this._futureUpdates.value = [];
      } else {
        // Create a new update object.
        const update = markRaw(new Update(parentUpdateId, [saved]));

        // Add the new update to the recent updates.
        this._recentUpdates.value.push(update);
      }
    } finally {
      this._busy.value = false;
    }
  }

  /**
   * Predict the next update.
   *
   * @param characterId If set, would force the character (or narrator) to speak.
   *
   * @assert There is no current episode.
   * @assert Can not go forward.
   */
  async predictUpdate(
    nEval: number,
    predictionOptions?: WriterPredictionOptions,
    inferenceOptions?: InferenceOptions,
    onDecodeProgress?: (event: { progress: number }) => void,
    inferenceAbortSignal?: AbortSignal,
  ) {
    if (this.busy.value) {
      throw new Error("Simulation is busy");
    }

    if (!this.writer.value) {
      throw new Error("Writer is not initialized");
    }

    if (!this.director.value) {
      throw new Error("Director is not initialized");
    }

    if (this.state.shallAdvanceEpisode.value) {
      throw new Error("Cannot create assistant update during an episode");
    }

    if (this.canGoForward.value) {
      throw new Error(
        "Cannot predict the next update if there are future updates",
      );
    }

    try {
      await this._commitCurrentState();

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

      await this._inferDirectorUpdate(inferenceAbortSignal);
      if (inferenceAbortSignal?.aborted) {
        console.warn("Director inference aborted");
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
    inferenceOptions?: InferenceOptions,
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
      if (inferenceAbortSignal?.aborted) {
        console.warn("Inference aborted");
        return;
      }

      await this._inferDirectorUpdate(inferenceAbortSignal);
      if (inferenceAbortSignal?.aborted) {
        console.warn("Director inference aborted");
        return;
      }
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

    if (!(variantIndex >= 0 && variantIndex < currentUpdate.variants.length)) {
      throw new Error(
        `Variant index out of range (${variantIndex}, expected [0, ${currentUpdate.variants.length})`,
      );
    }

    if (!this._previousState.value) {
      throw new Error("[BUG] No previous state to reset to");
    }

    const newVariant = currentUpdate.variants[variantIndex];

    // Synchronize the state with the chosen variant.
    this.state.setState(this._previousState.value);
    const code = newVariant.directorUpdate?.code;
    if (code) this.state.apply(code);

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
      await tx
        .update(d.simulations)
        .set({ currentUpdateId: newVariant.writerUpdate.id })
        .where(eq(d.simulations.id, this.id));
    });
  }

  /**
   * Edit the text of an update variant.
   *
   * @assert The simulation is not busy.
   * @assert There are changes to apply.
   */
  async editUpdateVariant(
    variant: (typeof Update.prototype.variants)[0],
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

    if (!this.writer.value) {
      return new Error("Writer is not initialized");
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

    if (!this.writer.value) return new Error("Writer is not initialized");

    const writerUpdate = this.currentUpdate.value?.chosenVariant?.writerUpdate;
    if (!writerUpdate) throw new Error("No current update");

    try {
      const summarizationResult = await this.writer.value.summarize(
        this._checkpoint.value!,
        this._historicalUpdates.value,
        this._recentUpdates.value,
        256,
        inferenceAbortSignal,
      );

      console.log("Summarization result", summarizationResult);

      await d.db.transaction(async (tx) => {
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

        await tx
          .update(d.writerUpdates)
          .set({ didConsolidate: true })
          .where(eq(d.writerUpdates.id, writerUpdate.id));
      });

      // Move all recent updates to historical updates.
      this._historicalUpdates.value.push(
        ...this._recentUpdates.value.splice(0),
      );

      // Clear the future updates.
      this._futureUpdates.value = [];
    } catch (e: any) {
      if (e instanceof InferenceAbortError) {
        console.warn("Inference aborted");
      } else {
        throw e;
      }
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

    this._recentUpdates.value.push(nextCurrentUpdate);

    const variant = nextCurrentUpdate.chosenVariant;
    if (!variant) throw new Error("BUG: No chosen variant");

    const directorUpdate = variant.directorUpdate;
    if (directorUpdate === undefined) {
      console.debug(
        "Fetching missing director update for",
        variant.writerUpdate.id,
      );

      variant.directorUpdate = await Simulation._fetchAppliedDirectorUpdate(
        variant.writerUpdate.id,
      );
    }

    if (directorUpdate) {
      this._dumpCurrentState();
      console.debug("Applying stage code", directorUpdate.code);
      this.state.apply(directorUpdate.code);
      console.debug("State after applying stage code", this.state.serialize());
    }
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
                ${d.writerUpdates.id.name},
                ${d.writerUpdates.simulationId.name},
                ${d.writerUpdates.parentUpdateId.name},
                ${d.writerUpdates.checkpointId.name},
                ${d.writerUpdates.didConsolidate.name},
                ${d.writerUpdates.createdByPlayer.name},
                ${d.writerUpdates.characterId.name},
                ${d.writerUpdates.text.name},
                ${d.writerUpdates.episodeId.name},
                ${d.writerUpdates.episodeChunkIndex.name},
                ${d.writerUpdates.llamaInferenceId.name},
                ${d.writerUpdates.createdAt.name}
              FROM
                ${writerUpdatesTableName}
              WHERE
                ${d.writerUpdates.id.name} = ? ${checkpointClauseA}
              UNION ALL
              SELECT
                parent.${d.writerUpdates.id.name},
                parent.${d.writerUpdates.simulationId.name},
                parent.${d.writerUpdates.parentUpdateId.name},
                parent.${d.writerUpdates.checkpointId.name},
                parent.${d.writerUpdates.didConsolidate.name},
                parent.${d.writerUpdates.createdByPlayer.name},
                parent.${d.writerUpdates.characterId.name},
                parent.${d.writerUpdates.text.name},
                parent.${d.writerUpdates.episodeId.name},
                parent.${d.writerUpdates.episodeChunkIndex.name},
                parent.${d.writerUpdates.llamaInferenceId.name},
                parent.${d.writerUpdates.createdAt.name}
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
    return parseSelectResult(d.writerUpdates, result);
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
  ) {
    const writerUpdatesQuery = new SQLiteSyncDialect().sqlToQuery(
      sql.raw(`
          WITH
            writer_updates_tree AS (
              SELECT
                ${d.writerUpdates.id.name},
                ${d.writerUpdates.simulationId.name},
                ${d.writerUpdates.parentUpdateId.name},
                ${d.writerUpdates.nextUpdateId.name},
                ${d.writerUpdates.checkpointId.name},
                ${d.writerUpdates.didConsolidate.name},
                ${d.writerUpdates.createdByPlayer.name},
                ${d.writerUpdates.characterId.name},
                ${d.writerUpdates.text.name},
                ${d.writerUpdates.episodeId.name},
                ${d.writerUpdates.episodeChunkIndex.name},
                ${d.writerUpdates.llamaInferenceId.name},
                ${d.writerUpdates.createdAt.name}
              FROM
                ${writerUpdatesTableName}
              WHERE
                ${d.writerUpdates.id.name} = ?
              UNION ALL
              SELECT
                next.${d.writerUpdates.id.name},
                next.${d.writerUpdates.simulationId.name},
                next.${d.writerUpdates.parentUpdateId.name},
                next.${d.writerUpdates.nextUpdateId.name},
                next.${d.writerUpdates.didConsolidate.name},
                next.${d.writerUpdates.checkpointId.name},
                next.${d.writerUpdates.createdByPlayer.name},
                next.${d.writerUpdates.characterId.name},
                next.${d.writerUpdates.text.name},
                next.${d.writerUpdates.episodeId.name},
                next.${d.writerUpdates.episodeChunkIndex.name},
                next.${d.writerUpdates.llamaInferenceId.name},
                next.${d.writerUpdates.createdAt.name}
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

    return parseSelectResult(d.writerUpdates, result);
  }

  /**
   * Fetch the applied (i.e. latest) director update for a writer update.
   */
  private static async _fetchAppliedDirectorUpdate(writerUpdateId: string) {
    return (
      (await d.db.query.directorUpdates.findFirst({
        where: eq(d.directorUpdates.writerUpdateId, writerUpdateId),
        orderBy: asc(d.directorUpdates.createdAt),
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
    writerUpdate: typeof d.writerUpdates.$inferSelect,
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
        })
      : [writerUpdate];

    let directorUpdate = fetchAppliedDirectorUpdate
      ? await Simulation._fetchAppliedDirectorUpdate(writerUpdate.id)
      : undefined;

    const update = markRaw(
      new Update(
        writerUpdate.parentUpdateId,
        siblings.map((sibling) => ({
          writerUpdate: sibling,
        })),
      ),
    );

    update.chosenVariantIndex.value = assertCallback(
      update.variants.findIndex((v) => v.writerUpdate.id === writerUpdate.id),
      (index) => index >= 0,
      "BUG: Chosen variant not found in siblings",
    );

    update.ensureChosenVariant.directorUpdate = directorUpdate ?? null;

    return update;
  }

  /**
   * Fetch the simulation's agent driver.
   */
  private static async _fetchDriver(
    agent: settings.AgentId,
  ): Promise<GptDriver> {
    const driverType = (await settings.getAgentDriver(agent)) || "remote";

    switch (driverType) {
      case "remote": {
        const baseUrl = await settings.getRemoteInferenceUrl();
        const model = await settings.getAgentRemoteModel(agent);

        return {
          type: "remote",
          baseUrl,
          model,
        };
      }

      case "local": {
        const modelPath = await settings.getAgentLocalModelPath(agent);
        if (!modelPath) throw new Error("Local model path not set");

        return {
          type: "local",
          modelPath,
        };
      }

      default:
        throw unreachable(driverType);
    }
  }

  private constructor(id: string, scenarioId: string, scenario: Scenario) {
    this.id = id;
    this.scenarioId = scenarioId;
    this.scenario = scenario;
    this.state = new State(scenario);
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

    this._initWriter((event) => {
      console.debug("Writer initialization progress", event.progress);
    });

    this._initDirector((event) => {
      console.debug("Director initialization progress", event.progress);
    });
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
      const update = this._recentUpdates.value[i];
      const directorUpdate = update.chosenVariant?.directorUpdate;

      if (directorUpdate) {
        console.debug("Applying stage code", directorUpdate.code);
        this.state.apply(directorUpdate.code);
      }

      // Set previous state to the -1st update's.
      // If there is only one recent update, it will be it.
      if (
        ++i ===
        (this._recentUpdates.value.length > 1
          ? this._recentUpdates.value.length - 1
          : 0)
      ) {
        this._dumpCurrentState();
      }
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

  /**
   * Prepare writer GPT for the simulation.
   */
  private async _initWriter(
    progressCallback: (event: { progress: number }) => void,
  ) {
    this._writer.value = await Writer.init(
      await Simulation._fetchDriver("writer"),
      latestWriterSession,
      this.scenario,
      this._checkpoint.value!,
      this._historicalUpdates.value,
      this._recentUpdates.value,
      progressCallback,
    );
  }

  /**
   * Prepare director GPT for the simulation.
   */
  private async _initDirector(
    progressCallback: (event: { progress: number }) => void,
  ) {
    this._director.value = await Director.init(
      await Simulation._fetchDriver("director"),
      latestDirectorSession,
      this.scenario,
      this._checkpoint.value!.state,
      this._recentUpdates.value,
      progressCallback,
    );
  }

  /**
   * Set {@link _previousState} to the current state snapshot.
   */
  private _dumpCurrentState() {
    this._previousState.value = this.state.serialize();
    console.debug("Saved previous state", clone(this._previousState.value));
  }

  /**
   * Check the current state, and save it as a new director update if
   * it differs from the current update's applied director update
   * (e.g. the user has changed it from the sandbox console).
   * Dumps the current state to {@link _previousState} afterwards.
   */
  // TODO: Same applies to a user update, when it has code.
  private async _commitCurrentState() {
    const update = this.currentUpdate.value;

    if (update) {
      const actualDelta = this.previousStateDelta.value ?? [];
      console.debug("Actual delta", actualDelta);

      console.debug(
        "Latest director update delta",
        update.chosenVariant?.directorUpdate?.code,
      );

      const deltasEqual = update.chosenVariant?.directorUpdate
        ? comparesStateDeltas(
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

        await d.db
          .insert(d.directorUpdates)
          .values({
            writerUpdateId: update.ensureChosenVariant.writerUpdate.id,
            code: actualDelta,
          })
          .returning()
          .then((directorUpdates) => {
            update.ensureChosenVariant.directorUpdate = directorUpdates[0];
          });
      }
    }

    this._dumpCurrentState();
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
      text: string;
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
      await tx
        .update(d.simulations)
        .set({
          currentUpdateId: childWriterUpdate.id,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(d.simulations.id, this.id));

      return { writerUpdate: childWriterUpdate, directorUpdate };
    });
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
    inferenceOptions?: InferenceOptions,
    onDecodeProgress?: (event: { progress: number }) => void,
    inferenceAbortSignal?: AbortSignal,
  ): Promise<{
    characterId: string | null;
    text: string;
  }> {
    if (!this.writer.value) {
      throw new Error("Writer is not initialized");
    }

    update.inProgressVariant.value = {
      characterId: predictionOptions?.characterId,
      text: "",
    };

    try {
      const writerResponse = await this.writer.value.inferUpdate(
        this._checkpoint.value!,
        this._historicalUpdates.value,
        recentUpdates,
        nEval,
        predictionOptions,
        inferenceOptions,
        onDecodeProgress,
        (e) => {
          update.inProgressVariant.value!.text += e.content;
        },
        inferenceAbortSignal,
      );

      console.log("Predicted update", writerResponse);

      const { writerUpdate } = await this._saveUpdatesToDb({
        writerUpdate: {
          parentUpdateId: update.parentId,
          checkpointId: this._checkpoint.value!.id,
          characterId: writerResponse.characterId,
          text: writerResponse.text,
        },
      });

      update.variants.push({
        writerUpdate,
        directorUpdate: null,
      });

      update.setChosenVariantToLast();
      return writerResponse;
    } finally {
      update.inProgressVariant.value = undefined;
    }
  }

  private async _inferDirectorUpdate(inferenceAbortSignal?: AbortSignal) {
    const result = await this.director.value!.inferUpdate(
      this._checkpoint.value!.state,
      this.state.serialize(),
      this._recentUpdates.value,
      256,
      { temp: 0.5 },
      (e) => {
        console.log(`Director decoding progress: ${e.progress}`);
      },
      undefined,
      inferenceAbortSignal,
    );

    console.log(result);
  }

  //
  //#endregion
}

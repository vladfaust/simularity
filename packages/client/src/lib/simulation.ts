import * as settings from "@/settings";
import { latestGptSession } from "@/store";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { Raw, computed, markRaw, readonly, ref, shallowRef } from "vue";
import { d, parseSelectResult, sqlite } from "./drizzle";
import { writerUpdatesTableName } from "./drizzle/schema";
import { InferenceOptions } from "./simularity/common";
import { Gpt, GptDriver, driversEqual } from "./simularity/gpt";
import * as rpChatWriter from "./simulation/agents/rpChatWriter";
import { Scenario } from "./simulation/scenario";
import { StageRenderer } from "./simulation/stageRenderer";
import { State, StateDto, comparesStateDeltas } from "./simulation/state";
import { StateCommand, stateCommandsToCode } from "./simulation/state/commands";
import { Update } from "./simulation/update";
import {
  Deferred,
  assert,
  assertFn,
  bufferToHex,
  clone,
  digest,
  unreachable,
} from "./utils";

export { State };
export type { Scenario };

export class Simulation {
  //#region Private fields
  private readonly _deferredWriter = new Deferred<Gpt>();

  // REFACTOR: Make Writer a separate class.
  private readonly _writer = shallowRef<Gpt | undefined>();

  private readonly _headWriterUpdateId = ref<string | undefined>();

  /**
   * Historical updates (older than the latest checkpoint),
   * ordered from the newest to the oldest.
   */
  private readonly _historicalUpdates = ref<Raw<Update>[]>([]);

  /**
   * Recent updates (until the latest checkpoint),
   * ordered from newest to the oldest.
   */
  private readonly _recentUpdates = ref<Raw<Update>[]>([]);

  private _previousState = shallowRef<StateDto | null>(null);
  private _busy = ref(false);
  private _currentUpdateIndex = ref(0);

  // TODO: Make it always defined (i.e. simulation is always in valid state).
  private _checkpoint = shallowRef<
    typeof d.checkpoints.$inferSelect | undefined
  >();

  private readonly _writerContextLength = ref(0);
  //#endregion

  readonly writer = this._writer;

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

  /**
   * Simulation updates, ordered from newest to the oldest.
   */
  readonly updates = computed(() => {
    return [...this._recentUpdates.value, ...this._historicalUpdates.value];
  });

  /**
   * The number of recent updates, used to determine the checkpoint position.
   */
  readonly recentUpdatesLength = computed(
    () => this._recentUpdates.value.length,
  );

  /**
   * The latest update.
   */
  readonly latestUpdate = computed(
    () =>
      this._recentUpdates.value.at(0) || this._historicalUpdates.value.at(0),
  );

  /**
   * Current update index.
   */
  readonly currentUpdateIndex = readonly(this._currentUpdateIndex);

  /**
   * The current update.
   */
  readonly currentUpdate = computed(() => {
    return this.updates.value.at(this._currentUpdateIndex.value);
  });

  /**
   * Would be false if {@link currentUpdate} is the oldest update.
   */
  readonly canGoBack = computed(
    () => this._currentUpdateIndex.value < this.updates.value.length - 1,
  );

  /**
   * Would be false if {@link currentUpdate} is the latest update.
   */
  readonly canGoForward = computed(() => this._currentUpdateIndex.value !== 0);

  /**
   * A condition that allows creating a new user update.
   */
  readonly canCreateUserUpdate = computed(() => {
    return (
      !this.busy.value &&
      !this.state.shallAdvanceEpisode.value &&
      !this.canGoForward.value
    );
  });

  /**
   * The committed writer prompt.
   */
  readonly writerPrompt = computed(() => this.writer.value?.prompt.value);

  /**
   * The actual writer context length.
   */
  readonly writerContextLength = readonly(this._writerContextLength);

  /**
   * The writer context size.
   */
  readonly writerContextSize = computed(() => this.writer.value?.contextSize);

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

    const scenario: Scenario = await fetch(
      `/scenarios/${simulation.scenarioId}/manifest.json`,
    ).then((response) => response.json());

    if (!scenario) {
      throw new Error(`Scenario not found: ${simulation.scenarioId}`);
    } else {
      console.debug("Found scenario", scenario);
    }

    const instance = new Simulation(
      simulationId,
      simulation.scenarioId,
      scenario,
      simulation.headWriterUpdateId!,
    );

    await instance._init();

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

    if (!this.state.currentEpisode.value) {
      throw new Error("No episode to advance");
    }

    if (!this.state.shallAdvanceEpisode.value) {
      throw new Error("Cannot advance the episode any further");
    }

    this._busy.value = true;
    try {
      await this._commitState();

      const { episodeId, text, chunkIndex, code, characterId } =
        await this.state.advanceCurrentEpisode();

      this._saveState();

      const parentUpdateId =
        this.latestUpdate.value?.chosenVariant?.writerUpdate.id;
      console.debug("Parent update ID", parentUpdateId);

      const incoming = await this._saveUpdatesToDb({
        writerUpdate: {
          parentUpdateId,
          checkpointId: this._checkpoint.value!.id,
          characterId,
          text,
          episodeId,
          episodeChunkIndex: chunkIndex,
        },
        directorUpdate: code ? { code } : undefined,
      });

      const episodeUpdate = markRaw(new Update(parentUpdateId, [incoming]));

      this._recentUpdates.value.unshift(episodeUpdate);

      const prompt = rpChatWriter.buildFullPrompt(
        this.scenario,
        this._checkpoint.value!.summary,
        this._historicalUpdates.value.slice().reverse(),
        this._recentUpdates.value.slice().reverse(),
      );

      this._deferredWriter.promise.then((writer) =>
        writer.decode(prompt, decodeProgressCallback).then((decodeResult) => {
          this._writerContextLength.value = decodeResult.contextLength;
        }),
      );
    } finally {
      this._busy.value = false;
    }
  }

  /**
   * Manually create a new update.
   *
   * @assert Simulation is not busy.
   * @assert There is no current episode.
   * @assert The current update is the latest one.
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

    if (
      this.latestUpdate.value?.parentId !== this.currentUpdate.value?.parentId
    ) {
      throw new Error("Current update is not the latest one");
    }

    this._busy.value = true;
    try {
      await this._commitState();

      const parentUpdateId =
        this.latestUpdate.value?.chosenVariant?.writerUpdate.id;

      // Insert the new update to the database.
      let saved = await this._saveUpdatesToDb({
        writerUpdate: {
          parentUpdateId,
          checkpointId: this._checkpoint.value!.id,
          characterId,
          text,
          createdByPlayer: true,
        },
      });

      // Create a new update.
      const userUpdate = markRaw(new Update(parentUpdateId, [saved]));
      this._recentUpdates.value.unshift(userUpdate);
      this.skipToEnd();
    } finally {
      this._busy.value = false;
    }
  }

  /**
   * Predict the next update.
   * @param characterId If set, would force the character (or narrator) to speak.
   * @assert There is no current episode.
   */
  async predictUpdate(
    nEval: number,
    predictionOptions?: rpChatWriter.PredictionOptions,
    inferenceOptions?: InferenceOptions,
    onDecodeProgress?: (event: { progress: number }) => void,
    inferenceAbortSignal?: AbortSignal,
  ) {
    if (this.busy.value) {
      throw new Error("Simulation is busy");
    }

    if (this.state.shallAdvanceEpisode.value) {
      throw new Error("Cannot create assistant update during an episode");
    }

    try {
      await this._commitState();

      const parentUpdateId =
        this.latestUpdate.value?.chosenVariant?.writerUpdate.id;

      const update = markRaw(new Update(parentUpdateId));
      this._recentUpdates.value.unshift(update);
      this.skipToEnd();

      const prompt = rpChatWriter.buildFullPrompt(
        this.scenario,
        this._checkpoint.value!.summary,
        this._historicalUpdates.value.slice().reverse(),
        this._recentUpdates.value.slice(1).reverse(), // Skip the just created update.
      );

      await this._inferUpdateVariantImpl(
        update,
        prompt,
        nEval,
        predictionOptions,
        inferenceOptions,
        onDecodeProgress,
        inferenceAbortSignal,
      );
    } finally {
      this._busy.value = false;
    }
  }

  /**
   * Generate a new update variant (i.e. regenerate).
   *
   * @assert The simulation is not busy.
   * @assert The update is the latest one.
   *
   * @param fadeFn A function that fades the scene prior to
   * resetting the state to the previous one.
   */
  async createUpdateVariant(
    update: Update,
    nEval: number,
    predictionOptions?: rpChatWriter.PredictionOptions,
    inferenceOptions?: InferenceOptions,
    onInferenceDecodingProgress?: (event: { progress: number }) => void,
    inferenceAbortSignal?: AbortSignal,
    fadeFn?: (callable: () => Promise<void>) => Promise<void>,
  ) {
    if (this.busy.value) {
      throw new Error("Cannot regenerate while busy");
    }

    if (update.parentId !== this.latestUpdate.value?.parentId) {
      throw new Error("Only the latest assistant update can be regenerated");
    }

    this._busy.value = true;
    try {
      // Reset the state to the previous one.
      const fadeCb = async () => this.state.setState(this._previousState.value);
      if (fadeFn) await fadeFn(fadeCb);
      else await fadeCb();

      this.skipToEnd();

      const prompt = rpChatWriter.buildFullPrompt(
        this.scenario,
        this._checkpoint.value!.summary,
        this._historicalUpdates.value.slice().reverse(),
        this._recentUpdates.value.slice(1).reverse(), // Skip the current update.
      );

      await this._inferUpdateVariantImpl(
        update,
        prompt,
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
   * Choose an update variant.
   *
   * @assert The simulation is not busy.
   * @assert The update is the latest one.
   *
   * @param fadeFn A function that fades the scene before applying the update.
   * Will only be called if the state delta differs from the chosen variant's code.
   */
  async chooseUpdateVariant(
    update: Update,
    variantIndex: number,
    fadeFn?: (callable: () => Promise<void>) => Promise<void>,
  ) {
    if (this.busy.value) {
      throw new Error("Simulation is busy");
    }

    if (update.parentId !== this.latestUpdate.value?.parentId) {
      throw new Error("Update is not the latest");
    }

    const code = update.variants[variantIndex].directorUpdate?.code;
    const actualDelta = this.state.delta(this._previousState.value);

    // If the state deltas differ between
    // the previous and the chosen variant...
    if (
      comparesStateDeltas(this._previousState.value, actualDelta, code ?? [])
    ) {
      // ...reset the state to the previous one,
      // and then apply the chosen variant.
      const cb = async () => {
        this.state.setState(this._previousState.value);
        const code = update.variants[variantIndex].directorUpdate?.code;
        if (code) this.state.apply(code);
      };

      if (fadeFn) await fadeFn(cb);
      else await cb();
    }

    this.skipToEnd();
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
   * Consolidate the simulation.
   */
  async consolidate(inferenceAbortSignal?: AbortSignal) {
    const summarizationPrompt = rpChatWriter.buildSummarizationPrompt(
      this.scenario,
      this._checkpoint.value!.summary,
      this._historicalUpdates.value.slice().reverse(),
      this._recentUpdates.value.slice().reverse(),
      256,
    );

    console.debug("Summarization prompt", summarizationPrompt);

    const summarizationResult = await this._deferredWriter.promise.then(
      async (writer_) => {
        return writer_.infer(
          summarizationPrompt,
          256,
          {
            temp: 0.2,
            stopSequences: ["\n"],
            grammar: rpChatWriter.buildSummarizationGrammar(),
          },
          (decodingEvent) => {
            console.log(
              "Summarization decoding progress",
              decodingEvent.progress,
            );
          },
          undefined,
          inferenceAbortSignal,
        );
      },
    );

    if (inferenceAbortSignal?.aborted) {
      console.warn("Summarization aborted", summarizationResult);
      return;
    }

    console.log("Summarization result", summarizationResult);

    this._checkpoint.value = (
      await d.db
        .insert(d.checkpoints)
        .values({
          writerUpdateId:
            this.latestUpdate.value!.chosenVariant!.writerUpdate.id,
          summary: summarizationResult.result,
          state: this.state.serialize(),
        })
        .returning()
    )[0];

    // Move all recent updates to historical updates.
    this._historicalUpdates.value.unshift(
      ...this._recentUpdates.value.splice(0),
    );
    this._recentUpdates.value = [];
  }

  // TODO: async editAssistantUpdateVariantCode() {}

  /**
   * Go back to the previous (older) update.
   */
  goBack() {
    if (this.canGoBack.value) {
      this._currentUpdateIndex.value++;
    }
  }

  /**
   * Go forward to the next (newer) update.
   */
  goForward() {
    if (this.canGoForward.value) {
      this._currentUpdateIndex.value--;
    }
  }

  /**
   * Skip to the latest update.
   */
  skipToEnd() {
    this._currentUpdateIndex.value = 0;
  }

  //#region Private methods
  //

  /**
   * Fetch the latest writer updates until `headUpdateId` (including),
   * sorted from the oldest to the newest. It uses a recursive CTE
   * to fetch the updates starting from the head.
   */
  private static async _fetchWriterUpdatesAsc(
    headUpdateId: string | null,
    checkpointId?: number | null,
    limit?: number,
  ) {
    let checkpointClause = "";

    if (checkpointId === null) {
      checkpointClause = `WHERE parent.${d.writerUpdates.checkpointId.name} IS NULL`;
    } else if (checkpointId) {
      checkpointClause = `WHERE parent.${d.writerUpdates.checkpointId.name} = ?`;
    }

    console.debug({ checkpointClause, checkpointId });

    const writerUpdatesQuery = new SQLiteSyncDialect().sqlToQuery(
      sql.raw(`
          WITH
            writer_updates_tree AS (
              SELECT
                ${d.writerUpdates.id.name},
                ${d.writerUpdates.parentUpdateId.name},
                ${d.writerUpdates.checkpointId.name},
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
                parent.${d.writerUpdates.id.name},
                parent.${d.writerUpdates.parentUpdateId.name},
                parent.${d.writerUpdates.checkpointId.name},
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
              ${checkpointClause}
              ${limit ? `LIMIT ?` : ""}
            )
          SELECT
            *
          FROM
            writer_updates_tree;
      `),
    );

    const params: any[] = [headUpdateId];
    if (checkpointId) params.push(checkpointId);
    if (limit) params.push(limit);

    const result = await sqlite.query(writerUpdatesQuery.sql, params);
    return parseSelectResult(d.writerUpdates, result);
  }

  /**
   * For each writer update, fetch the applied (i.e. latest) director update.
   */
  private static async _fetchAppliedDirectorUpdates(writerUpdateIds: string[]) {
    return d.db
      .select({
        id: d.directorUpdates.id,
        writerUpdateId: d.directorUpdates.writerUpdateId,
        code: d.directorUpdates.code,
        createdAt: sql<string>`max(${d.directorUpdates.createdAt})`,
        llamaInferenceId: d.directorUpdates.llamaInferenceId,
      })
      .from(d.directorUpdates)
      .where(inArray(d.directorUpdates.writerUpdateId, writerUpdateIds))
      .groupBy(d.directorUpdates.writerUpdateId)
      .orderBy(asc(d.directorUpdates.createdAt))
      .all();
  }

  private constructor(
    id: string,
    scenarioId: string,
    scenario: Scenario,
    headWriterUpdateId?: string,
  ) {
    this.id = id;
    this.scenarioId = scenarioId;
    this.scenario = scenario;
    this._headWriterUpdateId.value = headWriterUpdateId;
    this.state = new State(scenario);
  }

  private async _init() {
    await this._fetchInitialUpdates();
    console.debug("Fetched initial updates", this.updates.value);

    this._initWriter((event) => {
      console.debug("Writer initialization progress", event.progress);
    });

    await this._initState();
  }

  /**
   * Fetch the initial set of updates from the database.
   */
  private async _fetchInitialUpdates() {
    const headUpdate = await d.db.query.writerUpdates.findFirst({
      columns: { id: true, checkpointId: true },
      where: eq(d.writerUpdates.id, this._headWriterUpdateId.value!),
    });

    if (!headUpdate) {
      throw new Error("Head writer update not found");
    }

    if (!headUpdate.checkpointId) {
      throw new Error("Head writer update has no checkpoint");
    }

    this._checkpoint.value = await d.db.query.checkpoints.findFirst({
      where: eq(d.checkpoints.id, headUpdate.checkpointId),
    });
    if (!this._checkpoint.value) {
      throw new Error(`Checkpoint not found: ${headUpdate.checkpointId}`);
    }

    // NOTE: Includes the head update.
    const recentUpdates = await Simulation._fetchWriterUpdatesAsc(
      headUpdate.id,
      headUpdate.checkpointId,
    );

    const directorUpdates = await Simulation._fetchAppliedDirectorUpdates(
      recentUpdates.map((u) => u.id),
    );

    // Attach director updates to according writer updates.
    this._recentUpdates.value = recentUpdates.map((writerUpdate) => {
      const directorUpdate =
        directorUpdates.find(
          (directorUpdate) => directorUpdate.writerUpdateId === writerUpdate.id,
        ) ?? null;

      return markRaw(
        new Update(writerUpdate.parentUpdateId, [
          { writerUpdate, directorUpdate },
        ]),
      );
    });

    // Fetch the siblings of the latest recent update.
    // TODO: Fetch siblings of ALL recent updates?
    const latestRecentUpdate = this._recentUpdates.value.at(0);
    if (latestRecentUpdate) {
      const sanityCheckWriterUpdateId =
        latestRecentUpdate.chosenVariant?.writerUpdate.id;

      const siblings = await d.db.query.writerUpdates.findMany({
        where: and(
          latestRecentUpdate.parentId
            ? eq(d.writerUpdates.parentUpdateId, latestRecentUpdate.parentId)
            : isNull(d.writerUpdates.parentUpdateId),
          eq(d.writerUpdates.simulationId, this.id),
        ),
      });

      // Because it includes the latest update itself.
      assert(siblings.length > 0);

      // OPTIMIZE: Merge director update queries into one (see above).
      const directorUpdates = await Simulation._fetchAppliedDirectorUpdates(
        siblings.map((u) => u.id),
      );

      latestRecentUpdate.variants = siblings.map((writerUpdate) => ({
        writerUpdate,
        directorUpdate:
          directorUpdates.find(
            (directorUpdate) =>
              directorUpdate.writerUpdateId === writerUpdate.id,
          ) || null,
      }));

      latestRecentUpdate.chosenVariantIndex.value = assertFn(
        latestRecentUpdate.variants.findIndex(
          (v) => v.writerUpdate.id === sanityCheckWriterUpdateId,
        ),
        (index) => index >= 0,
        "Chosen variant not found in siblings",
      );
    }

    // Fetch historical updates starting from the oldest recent update.
    const oldestRecentUpdate = recentUpdates.at(-1);
    if (oldestRecentUpdate?.parentUpdateId) {
      this._historicalUpdates.value = (
        await Simulation._fetchWriterUpdatesAsc(
          oldestRecentUpdate.parentUpdateId,
          undefined,
          10,
        )
      ).map((writerUpdate) =>
        markRaw(new Update(writerUpdate.parentUpdateId, [{ writerUpdate }])),
      );
    }

    this.skipToEnd();
  }

  /**
   * Prepare writer GPT for the simulation.
   */
  // TODO: Move to Writer class.
  private async _initWriter(
    progressCallback: (event: { progress: number }) => void,
  ) {
    const staticPrompt = rpChatWriter.buildStaticPrompt(this.scenario);

    const dynamicPrompt = rpChatWriter.buildDynamicPrompt(
      this._checkpoint.value!.summary,
      this._historicalUpdates.value.slice(0).reverse(),
      this._recentUpdates.value.slice(0).reverse(),
    );

    const fullPrompt = staticPrompt + dynamicPrompt;

    const { gpt, needDecode } = await this._findOrCreateGpt(
      staticPrompt,
      dynamicPrompt,
      fullPrompt,
      progressCallback,
    );

    const writer_ = markRaw(gpt);

    if (needDecode) {
      writer_
        .decode(fullPrompt, progressCallback)
        .then(async (decodeResult) => {
          latestGptSession.value = {
            ...latestGptSession.value!,
            dynamicPromptHash: bufferToHex(
              await digest(dynamicPrompt, "SHA-256"),
            ),
          };

          console.info(
            "Updated latest GPT session dynamic prompt hash",
            latestGptSession.value!.dynamicPromptHash,
          );

          this._writerContextLength.value = decodeResult.contextLength;
        });
    }

    this._deferredWriter.resolve(writer_);
    this._writer.value = writer_;
  }

  // TODO: Move to `Gpt`.
  private async _findOrCreateGpt(
    staticPrompt: string,
    dynamicPrompt: string,
    fullPrompt: string,
    progressCallback: (event: { progress: number }) => void,
  ) {
    let driver: GptDriver;
    const driverType = (await settings.getGptDriver()) || "remote";
    switch (driverType) {
      case "remote": {
        const baseUrl =
          (await settings.getGptRemoteBaseUrl()) ||
          import.meta.env.VITE_DEFAULT_REMOTE_INFERENCE_SERVER_BASE_URL;
        const model =
          (await settings.getGptRemoteModel()) ||
          import.meta.env.VITE_DEFAULT_REMOTE_GPT_INFERENCE_MODEL;

        driver = {
          type: "remote",
          baseUrl,
          model,
        };

        break;
      }

      case "local": {
        const modelPath = await settings.getGptLocalModelPath();
        if (!modelPath) throw new Error("Local model path not set");

        const contextSize = await settings.getGptLocalContextSize();
        // if (!contextSize) throw new Error("Local context size not set");

        driver = {
          type: "local",
          modelPath,
          contextSize: contextSize ?? 0,
        };

        break;
      }

      default:
        throw unreachable(driverType);
    }

    let gpt: Gpt | null = null;
    let restored = false;
    let needDecode = true;

    const staticPromptHash = bufferToHex(await digest(staticPrompt, "SHA-256"));

    if (latestGptSession.value) {
      const areDriversEqual = driversEqual(
        latestGptSession.value.driver,
        driver,
      );

      if (areDriversEqual) {
        gpt = await Gpt.find(driver, latestGptSession.value.id, fullPrompt);
        restored = !!gpt;

        if (gpt) {
          console.log("Found GPT session", driver, gpt.id);

          if (latestGptSession.value.staticPromptHash === staticPromptHash) {
            const dynamicPromptHash = bufferToHex(
              await digest(dynamicPrompt, "SHA-256"),
            );

            if (
              latestGptSession.value.dynamicPromptHash === dynamicPromptHash
            ) {
              console.info("GPT session full prompt match", dynamicPromptHash);
              needDecode = false;
            } else {
              console.info(
                "GPT session dynamic prompt mismatch, need decode",
                latestGptSession.value.dynamicPromptHash,
                dynamicPromptHash,
              );
            }
          } else {
            console.info(
              "GPT static prompt mismatch, will destroy the session",
              latestGptSession.value.staticPromptHash,
              staticPromptHash,
            );

            gpt.destroy();
            gpt = null;
            restored = false;
            latestGptSession.value = null;
          }
        }
      } else {
        console.warn(
          "GPT driver mismatch",
          latestGptSession.value.driver,
          driver,
        );

        latestGptSession.value = null;
      }
    }

    if (!gpt) {
      console.debug("Creating new GPT session", driver);

      gpt = await Gpt.create(
        driver,
        staticPrompt,
        progressCallback,
        true,
        async (gpt) => {
          console.log("Initialized new GPT session", gpt.id.value);

          latestGptSession.value = {
            id: gpt.id.value!,
            driver,
            staticPromptHash,
            dynamicPromptHash: undefined,
          };
        },
      );
    }

    return { gpt, restored, needDecode };
  }

  /**
   * Save the current state as the previous state.
   */
  private _saveState() {
    this._previousState.value = this.state.serialize();
    console.debug("Saved previous state", clone(this._previousState.value));
  }

  /**
   * Initialize the simulation state.
   */
  private async _initState() {
    await this.state.initCodeEngine();

    this.state.setState(this._checkpoint.value!.state);

    // Apply existing director updates to the stage, from oldest to newest.
    //

    console.debug(
      "Recent updates",
      this._recentUpdates.value,
      this._recentUpdates.value.length,
    );
    let i = this._recentUpdates.value.length;
    while (i > 0) {
      const update = this._recentUpdates.value[--i];
      const directorUpdate = update.chosenVariant?.directorUpdate;

      if (directorUpdate) {
        console.debug(
          "Applying stage code",
          stateCommandsToCode(directorUpdate.code),
        );

        this.state.apply(directorUpdate.code);
      }

      // For the sake of regeneration, save the stage state at previous update.
      // But when there only one update, save the latest.
      if (this._recentUpdates.value.length == 1 || i === 1) {
        this._saveState();
      }
    }

    // If the latest update's (single) variant
    // has an episode ID, resume from there.
    console.debug("Latest update", this.latestUpdate.value);
    if (this.latestUpdate.value?.chosenVariant?.writerUpdate.episodeId) {
      const variant = this.latestUpdate.value?.chosenVariant;

      this.state.setEpisode(
        variant.writerUpdate.episodeId!,
        variant.writerUpdate.episodeChunkIndex! + 1,
      );
    }

    console.debug("Initialized state", this.state.serialize());
  }

  /**
   * Check the current state, and save it as a new director update if
   * it differs from the latest director update (e.g. the user has changed it
   * from the sandbox console).
   */
  private async _commitState() {
    // Check if the actual stage delta differs from the latest director update
    // (a player may change the state from the sandbox console for example).
    // If if differs, save the actual delta as a new director update.
    // TODO: Same applies to a user update, when it has code.
    if (this.latestUpdate.value) {
      const update = this.latestUpdate.value;

      const actualDelta = this.state.delta(this._previousState.value);
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
            writerUpdateId: update.chosenVariant!.writerUpdate.id,
            code: actualDelta,
          })
          .returning()
          .then((directorUpdates) => {
            update.chosenVariant!.directorUpdate = directorUpdates[0];
          });
      }
    }

    this._saveState();
  }

  /**
   * Save updates to the database.
   */
  private async _saveUpdatesToDb(updates: {
    writerUpdate: {
      parentUpdateId: string | undefined | null;
      checkpointId: number;
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
      const writerUpdate = (
        await tx
          .insert(d.writerUpdates)
          .values({
            simulationId: this.id,
            ...updates.writerUpdate,
          })
          .returning()
      )[0];

      let directorUpdate;
      if (updates.directorUpdate) {
        directorUpdate = (
          await tx
            .insert(d.directorUpdates)
            .values({
              writerUpdateId: writerUpdate.id,
              ...updates.directorUpdate,
            })
            .returning()
        )[0];
      }

      await tx
        .update(d.simulations)
        .set({
          headWriterUpdateId: writerUpdate.id,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(d.simulations.id, this.id));

      return { writerUpdate, directorUpdate };
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
    prompt: string,
    nEval: number,
    predictionOptions?: rpChatWriter.PredictionOptions,
    inferenceOptions?: InferenceOptions,
    onDecodeProgress?: (event: { progress: number }) => void,
    inferenceAbortSignal?: AbortSignal,
  ): Promise<{
    characterId: string | null;
    text: string;
  }> {
    update.inProgressVariant.value = {
      characterId: predictionOptions?.characterId,
      text: "",
    };

    try {
      const writerResponse = await this._deferredWriter.promise.then(
        async (writer_) => {
          const stopSequences = ["\n"];

          const options: InferenceOptions = {
            stopSequences,
            grammar: rpChatWriter.buildChatGrammar(
              this.scenario,
              predictionOptions,
            ),
            ...inferenceOptions,
          };

          console.log(
            "Inferring update",
            prompt,
            nEval,
            options,
            predictionOptions,
          );

          const inferenceResult = await writer_.infer(
            prompt,
            nEval,
            options,
            onDecodeProgress,
            (e) => {
              update.inProgressVariant.value!.text += e.content;
            },
            inferenceAbortSignal,
          );

          const parsedResult = rpChatWriter.parsePrediction(
            inferenceResult.result,
            this.scenario,
            predictionOptions,
          );

          this._writerContextLength.value = inferenceResult.contextLength;

          return parsedResult;
        },
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

      update.chosenVariantIndex.value = update.variants.length - 1;
      return writerResponse;
    } finally {
      update.inProgressVariant.value = undefined;
    }
  }

  //
  //#endregion
}

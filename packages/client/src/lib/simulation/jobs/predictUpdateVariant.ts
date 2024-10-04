import * as baseLlmDriver from "@/lib/ai/llm/BaseLlmDriver";
import { d } from "@/lib/drizzle";
import * as resources from "@/lib/resources";
import type { LocalScenario } from "@/lib/scenario";
import { Mode, Simulation } from "@/lib/simulation";
import * as storage from "@/lib/storage";
import { directorTeacherMode } from "@/lib/storage/llm";
import { Bug, clone } from "@/lib/utils";
import { eq } from "drizzle-orm";
import pRetry from "p-retry";
import { markRaw, readonly, ref } from "vue";
import * as director from "../agents/director";
import * as voicer from "../agents/voicer";
import * as writer from "../agents/writer";
import * as state from "../state";
import { UpdateVariant, type Update } from "../update";

export class PredictUpdateVariantJob {
  private readonly _writerDone = ref<boolean>(false);
  readonly writerDone = readonly(this._writerDone);

  private readonly _directorDone = ref<boolean | undefined>();
  readonly directorDone = readonly(this._directorDone);

  private readonly _voicerJob = ref<voicer.VoicerJob | undefined | null>();
  /**
   * Null when TTS is disabled for this prediction, undefined when waiting.
   */
  readonly voicerJob = readonly(this._voicerJob);

  constructor(
    readonly simulationId: number,
    readonly scenario: LocalScenario,
    readonly mode: Mode,
    readonly agents: {
      writer: writer.Writer;
      director: director.Director | undefined;
      voicer: voicer.Voicer;
    },
    readonly checkpoint: typeof d.checkpoints.$inferSelect,
    readonly state: state.State | undefined,
    readonly update: Update,
    readonly historicalUpdates: Update[],
    readonly recentUpdates: Update[],
    readonly writerParams: {
      nEval: number;
      predictionOptions?: writer.PredictionOptions;
      inferenceOptions?: baseLlmDriver.CompletionOptions;
    },
  ) {
    if (
      !(agents.voicer.ttsDriver.value && storage.tts.ttsConfig.value?.enabled)
    ) {
      this._voicerJob.value = null;
    }

    if (mode === Mode.Immersive) {
      if (!agents.director) {
        throw new Bug("Director is required in immersive mode");
      } else if (!state) {
        throw new Bug("State is required in immersive mode");
      }
    }
  }

  async run(abortSignal?: AbortSignal) {
    this.update.inProgressVariant.value = {
      characterId: undefined,
      clockString: undefined,
      text: "",
    };

    try {
      this._writerDone.value = false;
      this._directorDone.value =
        this.mode === Mode.Immersive && !directorTeacherMode.value
          ? false
          : undefined;

      const writerResponse = await this.agents.writer.inferUpdate(
        this.checkpoint,
        this.historicalUpdates,
        this.recentUpdates,
        this.mode === Mode.Immersive ? this.state!.serialize() : undefined,
        this.writerParams.nEval,
        this.writerParams.predictionOptions,
        this.writerParams.inferenceOptions,
        undefined,
        (e) => {
          this.update.inProgressVariant.value!.text += e.content;
        },
        abortSignal,
      );

      console.log("Predicted writer update", writerResponse);
      this._writerDone.value = true;
      // TODO: Check if abort signal was triggered.

      let doTts = false;
      if (
        this.agents.voicer.ttsDriver.value &&
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
          this.agents.voicer.createTtsJob(
            writerResponse.characterId,
            writerResponse.text,
          ),
        );
      } else {
        // No TTS, so we're done.
        this._voicerJob.value = null;
      }

      let directorResponse;
      if (this.mode === Mode.Immersive && !directorTeacherMode.value) {
        directorResponse = await pRetry(
          async () => {
            const directorResponse = await this._inferDirectorUpdate(
              writerResponse,
              abortSignal,
              {
                charactersAllowedToEnterTheStage:
                  this.writerParams.predictionOptions?.allowedCharacterIds,
              },
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
              if (error instanceof director.PredictionError) {
                console.warn("Failed to infer director update", error);
              } else {
                throw error;
              }
            },
          },
        );
        this._directorDone.value = true;
      }

      const { writerUpdate, directorUpdate } =
        await Simulation._saveUpdatesToDb(this.simulationId, {
          writerUpdate: {
            parentUpdateId: this.update.parentId,
            checkpointId: this.checkpoint.id,
            characterId: writerResponse.characterId,
            simulationDayClock: writerResponse.simulationDayClock,
            text: writerResponse.text,
            llmCompletionId: writerResponse.completion.id,
          },

          directorUpdate: directorResponse
            ? {
                code: directorResponse.delta,
                llmCompletionId: directorResponse.completion?.id,
              }
            : undefined,
        });

      let ttsPath: string | null = null;
      if (this._voicerJob.value) {
        console.log("Waiting for TTS job to finish");
        const result = await this._voicerJob.value.result.promise;
        console.log("TTS job finished", result);

        if (result instanceof Error) {
          console.error("TTS job failed", result);
        } else {
          console.debug("Saving TTS audio");

          ttsPath = await resources.tts.saveAudio(
            this.simulationId,
            writerUpdate.id,
            result,
            ".mp3",
          );

          // ADHOC: Only at this point we know the TTS path.
          this.agents.voicer._setCurrentTtsFilePath(ttsPath);
        }
      }

      if (directorUpdate?.code.length) {
        console.log("Applying stage code", directorUpdate.code);
        this.state!.apply(directorUpdate.code);
      }

      this.update.variants.value.push(
        markRaw(
          new UpdateVariant(
            {
              ...writerUpdate,
              completion: writerResponse.completion,
            },
            directorUpdate,
            this.state?.serialize(),
            ttsPath,
          ),
        ),
      );

      this.update.setChosenVariantToLast();

      return writerResponse;
    } finally {
      this.update.inProgressVariant.value = undefined;
    }
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
      this.checkpoint.id
    ) {
      console.debug("Using current checkpoint for state ensuring");
      currentCheckpoint = this.checkpoint;
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
    let currentState: state.StateDto = clone(currentCheckpoint.state!);
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
          state.applyCommandsToStateDtoUnsafe(
            currentState,
            directorUpdate.code,
          );
        }

        console.debug("Current state after applying earlier update", {
          writerUpdateId: earlierUpdate.id,
          text: earlierUpdate.text,
          state: clone(currentState),
        });
      }
    }

    for (const update of updates) {
      if (update.ensureChosenVariant.state.value) {
        console.debug("State already ensured for", {
          writerUpdateId: update.ensureChosenVariant.writerUpdate.id,
          text: update.ensureChosenVariant.writerUpdate.text,
        });

        currentState = clone(update.ensureChosenVariant.state.value);
        continue;
      }

      if (update.ensureChosenVariant.directorUpdate.value === undefined) {
        console.debug(
          "Fetching missing director update for",
          update.ensureChosenVariant.writerUpdate.id,
        );

        update.ensureChosenVariant.directorUpdate.value =
          await Simulation._fetchAppliedDirectorUpdate(
            update.ensureChosenVariant.writerUpdate.id,
          );
      }

      if (update.ensureChosenVariant.directorUpdate.value) {
        state.applyCommandsToStateDtoUnsafe(
          currentState,
          update.ensureChosenVariant.directorUpdate.value.code,
        );
      }

      update.ensureChosenVariant.state.value = clone(currentState);

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
    abortSignal?: AbortSignal,
    predictionOptions?: director.PredictionOptions,
  ) {
    const directorIncomingUpdates: director.SimpleUpdate[] = [];

    if (incomingWriterUpdate) {
      directorIncomingUpdates.push(incomingWriterUpdate);
    }

    /** In addition to recent updates. */
    const maxHistoricalUpdates = 5;

    // Merge N top latest historical updates with all the recent updates.
    const candidates = [
      ...this.historicalUpdates.slice(-1, -1 - maxHistoricalUpdates),

      // The last recent update is the current one, do not include it.
      ...this.recentUpdates.slice(0, incomingWriterUpdate ? undefined : -1),
    ];

    const directorHistoricalUpdates: Update[] = [];

    // We're using reverse to add any director-less updates to the incoming
    // updates until a director-full update is found.
    for (const candidate of candidates.reverse()) {
      const variant = candidate.ensureChosenVariant;

      if (variant.directorUpdate.value === undefined) {
        console.debug(
          "Fetching missing director update for",
          variant.writerUpdate.id,
        );

        variant.directorUpdate.value =
          await Simulation._fetchAppliedDirectorUpdate(variant.writerUpdate.id);
      }

      if (directorHistoricalUpdates.length) {
        // We already have historical updates, so all the upcoming updates
        // are forced to be historical as well.
        directorHistoricalUpdates.unshift(candidate);
      } else if (variant.directorUpdate) {
        // This one has a director update, therefore
        // it belongs to the historical updates.
        directorHistoricalUpdates.unshift(candidate);
      } else {
        // We've confirmed that this update's director update
        // is null, so it goes to the incoming updates.
        directorIncomingUpdates.unshift({
          characterId: variant.writerUpdate.characterId,
          text: variant.writerUpdate.text,
        });
      }
    }

    // Finally, ensure that all historical updates have their states set,
    // so that the director can serialize those states.
    await this._ensureUpdateStates(directorHistoricalUpdates);

    return this.agents.director!.inferUpdate(
      directorHistoricalUpdates.map((update) => {
        const variant = update.ensureChosenVariant;

        return {
          characterId: variant.writerUpdate.characterId,
          text: variant.writerUpdate.text,

          // That's what all that fuss was about.
          state: variant.directorUpdate.value?.code.length
            ? variant.state.value
            : undefined,
        };
      }),

      this.state!.serialize(),
      directorIncomingUpdates,

      256,
      { temp: 0.5 },
      predictionOptions,
      (e) => {
        console.log(`Director decoding progress: ${e.progress}`);
      },
      undefined,
      abortSignal,
    );
  }
}

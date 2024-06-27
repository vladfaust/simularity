import { toMilliseconds } from "duration-fns";
import { nanoid } from "nanoid";
import { Ref, computed, markRaw, readonly, ref } from "vue";
import { InferenceOptionsSchema } from "./ai/common";
import * as remoteInferenceClient from "./remoteInferenceClient";
import * as tauri from "./tauri";
import { Deferred, sleep, unreachable } from "./utils";
import { v } from "./valibot";

export type GptDriver =
  | {
      type: "remote";
      baseUrl: string;
      model: string;
    }
  | {
      type: "local";
      modelPath: string;
      contextSize: number;
      batchSize: number;
    };

abstract class Job<T> {
  readonly deferred = new Deferred<T>();
  constructor(readonly fn: () => Promise<T>) {}
  get result() {
    return this.deferred.promise;
  }
}

export class GptInitJob extends Job<string> {
  readonly progress = ref(0);

  constructor(
    gpt: Gpt,
    initialPrompt?: string,
    progressCallback_?: (event: { progress: number }) => void,
    dumpSession?: boolean,
  ) {
    super(async (): Promise<string> => {
      const progressCallback = (event: { progress: number }) => {
        console.debug("GPT init progress", event.progress);
        this.progress.value = event.progress;
        progressCallback_?.(event);
      };

      switch (gpt.driver.type) {
        case "local": {
          const id = nanoid();
          await tauri.gpt.create(
            id,
            gpt.driver.modelPath,
            gpt.driver.contextSize,
            gpt.driver.batchSize,
            initialPrompt,
            progressCallback,
            dumpSession,
          );
          this.progress.value = 1;
          return id;
        }

        case "remote": {
          const id = (
            await remoteInferenceClient.gpt.create(
              gpt.driver.baseUrl,
              {
                model: gpt.driver.model,
                initialPrompt,
              },
              { timeout: toMilliseconds({ minutes: 2 }) },
              progressCallback,
            )
          ).sessionId;
          this.progress.value = 1;
          return id;
        }

        default:
          throw unreachable(gpt.driver);
      }
    });
  }
}

export class GptDecodeJob extends Job<void> {
  readonly progress = ref(0);

  constructor(
    gpt: Gpt,
    readonly prompt: string,
    readonly decodeCallback_?: (event: { progress: number }) => void,
  ) {
    super(async (): Promise<void> => {
      if (!gpt.isInitialized.value) {
        throw new Error("GPT is not initialized.");
      }

      const decodeCallback = (event: { progress: number }) => {
        this.progress.value = event.progress;
        decodeCallback_?.(event);
      };

      switch (gpt.driver.type) {
        case "local":
          await tauri.gpt.decode(gpt.id.value!, prompt, decodeCallback);
          return;
        case "remote":
          await remoteInferenceClient.gpt.decode(
            gpt.driver.baseUrl,
            gpt.id.value!,
            { prompt },
            { timeout: toMilliseconds({ minutes: 2 }) },
            decodeCallback,
          );
          return;
        default:
          throw unreachable(gpt.driver);
      }
    });
  }
}

export class GptInferJob extends Job<string> {
  readonly decodeProgress: Ref<number | undefined>;

  constructor(
    gpt: Gpt,
    readonly prompt: string | null,
    readonly nEval: number,
    readonly options: v.InferInput<typeof InferenceOptionsSchema>,
    readonly decodeCallback_?: (event: { progress: number }) => void,
    readonly inferenceCallback_?: (event: { content: string }) => void,
  ) {
    super(async (): Promise<string> => {
      if (!gpt.isInitialized.value) {
        throw new Error("GPT is not initialized.");
      }

      const decodeCallback = (event: { progress: number }) => {
        this.decodeProgress.value = event.progress;
        decodeCallback_?.(event);
      };

      const inferenceCallback = (event: { content: string }) => {
        if (this.decodeProgress.value !== 1) {
          this.decodeProgress.value = 1;
          decodeCallback_?.({ progress: 1 });
        }

        inferenceCallback_?.(event);
      };

      switch (gpt.driver.type) {
        case "local":
          return tauri.gpt.infer(
            gpt.id.value!,
            prompt,
            nEval,
            options,
            decodeCallback,
            inferenceCallback,
          );
        case "remote":
          return (
            await remoteInferenceClient.gpt.infer(
              gpt.driver.baseUrl,
              gpt.id.value!,
              { prompt, nEval, options },
              { timeout: toMilliseconds({ minutes: 2 }) },
              decodeCallback,
              inferenceCallback,
            )
          ).result;
        default:
          throw unreachable(gpt.driver);
      }
    });

    this.decodeProgress = ref(prompt ? 0 : undefined);
  }
}

export class GptCommitJob extends Job<number> {
  constructor(gpt: Gpt) {
    super(async (): Promise<number> => {
      if (!gpt.isInitialized.value) {
        throw new Error("GPT is not initialized.");
      }

      switch (gpt.driver.type) {
        case "local":
          return tauri.gpt.commit(gpt.id.value!);
        case "remote":
          return (
            await remoteInferenceClient.gpt.commit(
              gpt.driver.baseUrl,
              gpt.id.value!,
            )
          ).kvCacheSize;
        default:
          throw unreachable(gpt.driver);
      }
    });
  }
}

type GptJob = GptInitJob | GptDecodeJob | GptInferJob | GptCommitJob;

/**
 * A GPT instance, routing requests to the appropriate backend (local or remote).
 * It features a job queue to ensure that only one job is running at a time.
 */
export class Gpt {
  /**
   * Find an existing GPT instance.
   */
  static async find(driver: GptDriver, id: string): Promise<Gpt | null> {
    let found = false;

    switch (driver.type) {
      case "local":
        found = await tauri.gpt.find(id);
        break;
      case "remote":
        found = await remoteInferenceClient.gpt.find(driver.baseUrl, id);
        break;
      default:
        throw unreachable(driver);
    }

    return found ? new Gpt(id, driver) : null;
  }

  /**
   * Create a new GPT instance.
   *
   * @param staticPrompt If set, would try to preload the session,
   * or decode from scratch.
   *
   * @param dumpSession If set, would dump the session to disk.
   * Ignored for remote inference.
   */
  static async create(
    driver: GptDriver,
    staticPrompt: string | undefined,
    initProgressCallback: (event: { progress: number }) => void | undefined,
    dumpSession: boolean | undefined,
    onInitCallback?: (id: string) => void,
  ): Promise<Gpt> {
    const gpt = new Gpt(undefined, driver, staticPrompt);

    gpt
      .initialize(dumpSession, initProgressCallback)
      .then((id) => onInitCallback?.(id));

    return gpt;
  }

  readonly driver: GptDriver;

  private readonly _id = ref<string | undefined>();
  readonly id = readonly(this._id);
  readonly isInitialized = computed(() => !!this.id.value);

  private readonly _jobs = ref<GptJob[]>([]);
  readonly jobs = readonly(this._jobs);

  private readonly _currentJob = ref<GptJob | null>(null);
  readonly currentJob = readonly(this._currentJob);

  private readonly _wouldDestroy = ref(false);
  readonly wouldDestroy = readonly(this._wouldDestroy);

  readonly staticPrompt: string | undefined;

  private readonly _dynamicPromptCommitted = ref("");
  readonly dynamicPromptCommitted = readonly(this._dynamicPromptCommitted);

  private readonly _dynamicPromptUncommitted = ref("");
  readonly dynamicPromptUncommitted = readonly(this._dynamicPromptUncommitted);

  /**
   * Decode the prompt, updating the KV cache.
   */
  // TODO: Return the new KV cache size.
  async decode(
    prompt: string,
    callback?: (event: { progress: number }) => void,
  ): Promise<void> {
    await this.pushJob(markRaw(new GptDecodeJob(this, prompt, callback)));
    this._dynamicPromptCommitted.value += prompt;
  }

  /**
   * Infer text from the prompt.
   * @param prompt If null, would infer from the current context.
   * @param nEval Number of evaluations to perform.
   */
  async infer(
    prompt: string | null,
    nEval: number,
    options: v.InferInput<typeof InferenceOptionsSchema> = {},
    decodeCallback?: (event: { progress: number }) => void,
    inferenceCallback_?: (event: { content: string }) => void,
  ): Promise<string> {
    let decodeComplete = false;

    return this.pushJob(
      markRaw(
        new GptInferJob(
          this,
          prompt,
          nEval,
          options,
          decodeCallback,
          (event) => {
            if (!decodeComplete) {
              if (prompt) {
                this._dynamicPromptUncommitted.value += prompt;
              }

              decodeComplete = true;
            }

            this._dynamicPromptUncommitted.value += event.content;
            inferenceCallback_?.(event);
          },
        ),
      ),
    );
  }

  /**
   * Commit the latest inference result to the GPT's KV cache.
   */
  // TODO: Return the new KV cache size.
  async commit(): Promise<number> {
    const result = await this.pushJob(markRaw(new GptCommitJob(this)));
    this._dynamicPromptCommitted.value = this._dynamicPromptUncommitted.value;
    this._dynamicPromptUncommitted.value = "";
    return result;
  }

  /**
   * Destroy this GPT instance.
   * Would wait for the current job to finish before destroying.
   */
  async destroy(): Promise<void> {
    if (this._wouldDestroy.value) {
      while (this._wouldDestroy.value) {
        await sleep(100);
        return;
      }
    }

    this._wouldDestroy.value = true;

    // Wait for the current job to finish before destroying.
    while (this._currentJob.value) {
      await sleep(100);
    }

    this._wouldDestroy.value = false;

    if (this.id.value) {
      switch (this.driver.type) {
        case "local":
          return tauri.gpt.destroy(this.id.value);
        case "remote":
          return remoteInferenceClient.gpt.destroy(
            this.driver.baseUrl,
            this.id.value,
          );
        default:
          throw unreachable(this.driver);
      }
    } else {
      console.info("GPT instance not initialized, noop destroy");
    }
  }

  /**
   * Returns the number of tokens in the prompt.
   */
  async tokenCount(prompt: string): Promise<number> {
    switch (this.driver.type) {
      case "local":
        return tauri.gpt.tokenCount(this.driver.modelPath, prompt);
      case "remote":
        return remoteInferenceClient.gpt.tokenCount(
          this.driver.baseUrl,
          this.driver.model,
          prompt,
        );
      default:
        throw unreachable(this.driver);
    }
  }

  private constructor(
    id: string | undefined,
    driver: GptDriver,
    staticPrompt?: string,
  ) {
    this._id.value = id;
    this.driver = driver;
    this.staticPrompt = staticPrompt;
  }

  private async initialize(
    dumpSession?: boolean,
    progressCallback?: (event: { progress: number }) => void,
  ): Promise<string> {
    return (this._id.value = await this.pushJob(
      markRaw(
        new GptInitJob(this, this.staticPrompt, progressCallback, dumpSession),
      ),
    ));
  }

  private async pushJob<T>(job: Job<T>): Promise<T> {
    this._jobs.value.push(job as any);
    this.wakeUp();
    return job.result;
  }

  // Wake up for a single job completion.
  private async wakeUp(): Promise<void> {
    while (this._currentJob.value) {
      await sleep(100);
    }

    let job = this._jobs.value.shift();
    if (job) {
      console.debug(this.id.value, "Performing job...", job.constructor.name);
      this._currentJob.value = job;

      try {
        const result = (await job.fn()) as any;
        job.deferred.resolve(result);
      } catch (error) {
        console.error(this.id, "Job error", job, error);
        this._jobs.value.length = 0; // Clear the queue.
        job.deferred.reject(error);
      } finally {
        if (this._wouldDestroy.value) {
          this._jobs.value.length = 0; // Clear the queue.
          this._wouldDestroy.value = false;
        }

        this._currentJob.value = null;
      }
    } else {
      console.debug(this.id, "No jobs to do.");
    }
  }
}

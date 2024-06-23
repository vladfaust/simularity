import { toMilliseconds } from "duration-fns";
import { nanoid } from "nanoid";
import { ref } from "vue";
import { InferenceOptionsSchema } from "./ai/common";
import * as remoteInferenceClient from "./remoteInferenceClient";
import * as tauri from "./tauri";
import { Deferred, sleep, unreachable } from "./utils";
import { v } from "./valibot";

export type InferenceEvent = {
  content: string;
};

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

type GptJob = GptDecodeJob | GptInferJob | GptCommitJob;

abstract class Job<T> {
  abstract name: string;
  readonly deferred = new Deferred<T>();
  constructor(readonly fn: () => Promise<T>) {}
  get result() {
    return this.deferred.promise;
  }
}

class GptDecodeJob extends Job<void> {
  name = "Decode";

  constructor(
    gpt: Gpt,
    readonly prompt: string,
    readonly dumpSession: boolean,
  ) {
    super(async (): Promise<void> => {
      switch (gpt.driver.type) {
        case "local":
          return tauri.gpt.decode(gpt.id, prompt, dumpSession);
        case "remote":
          await remoteInferenceClient.gpt.decode(
            gpt.driver.baseUrl,
            gpt.id,
            { prompt, dumpSession },
            { timeout: toMilliseconds({ minutes: 2 }) },
          );

          return;
        default:
          throw unreachable(gpt.driver);
      }
    });
  }
}

class GptInferJob extends Job<string> {
  name = "Infer";

  constructor(
    gpt: Gpt,
    readonly prompt: string | null,
    readonly nEval: number,
    readonly options: v.InferInput<typeof InferenceOptionsSchema>,
    readonly callback?: (event: InferenceEvent) => void,
  ) {
    super(async (): Promise<string> => {
      switch (gpt.driver.type) {
        case "local":
          return tauri.gpt.infer(gpt.id, prompt, nEval, options, callback);
        case "remote":
          return (
            await remoteInferenceClient.gpt.infer(
              gpt.driver.baseUrl,
              gpt.id,
              { prompt, nEval, options },
              { timeout: toMilliseconds({ minutes: 2 }) },
              callback,
            )
          ).result;
        default:
          throw unreachable(gpt.driver);
      }
    });
  }
}

class GptCommitJob extends Job<number> {
  name = "Commit";

  constructor(gpt: Gpt) {
    super(async (): Promise<number> => {
      switch (gpt.driver.type) {
        case "local":
          return tauri.gpt.commit(gpt.id);
        case "remote":
          return (
            await remoteInferenceClient.gpt.commit(gpt.driver.baseUrl, gpt.id)
          ).kvCacheSize;
        default:
          throw unreachable(gpt.driver);
      }
    });
  }
}

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
   * @param initialPrompt If set, would try to preload the session,
   * otherwise decode from scratch.
   */
  static async create(
    driver: GptDriver,
    initialPrompt?: string,
  ): Promise<{ gpt: Gpt; sessionLoaded?: boolean }> {
    let id: string;
    let sessionLoaded: boolean | undefined;

    switch (driver.type) {
      case "local": {
        id = nanoid();

        const response = await tauri.gpt.create(
          id,
          driver.modelPath,
          driver.contextSize,
          driver.batchSize,
          initialPrompt,
        );

        sessionLoaded = response.sessionLoaded;
        break;
      }

      case "remote": {
        const response = await remoteInferenceClient.gpt.create(
          driver.baseUrl,
          {
            model: driver.model,
            initialPrompt,
          },
        );

        id = response.id;
        sessionLoaded = response.sessionLoaded;

        break;
      }

      default:
        throw unreachable(driver);
    }

    return { gpt: new Gpt(id, driver), sessionLoaded };
  }

  private _id: string;
  private _jobs = ref<GptJob[]>([]);
  private _currentJob = ref<GptJob | null>(null);
  private _wouldDestroy = ref(false);

  get id() {
    return this._id;
  }

  get jobs() {
    return this._jobs;
  }

  get currentJob() {
    return this._currentJob;
  }

  /**
   * Decode the prompt, updating the KV cache.
   * @param dumpSession If set, would dump the session into a file
   * (only use for initial decodes).
   */
  // TODO: Return the new KV cache size.
  async decode(prompt: string, dumpSession: boolean = false): Promise<void> {
    return this.pushJob(new GptDecodeJob(this, prompt, dumpSession));
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
    callback?: (event: InferenceEvent) => void,
  ): Promise<string> {
    return this.pushJob(
      new GptInferJob(this, prompt, nEval, options, callback),
    );
  }

  /**
   * Commit the latest inference result to the GPT's KV cache.
   */
  // TODO: Return the new KV cache size.
  async commit(): Promise<number> {
    return this.pushJob(new GptCommitJob(this));
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

    switch (this.driver.type) {
      case "local":
        return tauri.gpt.destroy(this.id);
      case "remote":
        return remoteInferenceClient.gpt.destroy(this.driver.baseUrl, this.id);
      default:
        throw unreachable(this.driver);
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
    id: string,
    readonly driver: GptDriver,
  ) {
    this._id = id;
  }

  private async pushJob<T>(job: Job<T>): Promise<T> {
    this._jobs.value.push(job as unknown as GptJob);
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
      console.debug(this.id, "Performing job...", job.name);
      this._currentJob.value = job;

      try {
        const result = (await job.fn()) as any;
        job.deferred.resolve(result);
      } catch (error) {
        console.error(this.id, "Job error", job.name, error);
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

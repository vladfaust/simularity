import { toMilliseconds } from "duration-fns";
import { ref } from "vue";
import * as remoteInferenceClient from "./remoteInferenceClient";
import * as tauri from "./tauri";
import { Deferred, sleep, unreachable } from "./utils";

export type InferOptions = {
  stopSequences?: string[];
  grammar?: string;
  temp?: number;
  topK?: number;
  minP?: number;
  topP?: number;
  tfsZ?: number;
  typicalP?: number;
  mirostat?: {
    tau: number;
    eta: number;
  };
};

type Driver =
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

// IDEA: Merge multiple `decode+, infer?` jobs into one.
class GptDecodeJob extends Job<void> {
  name = "Decoding";

  constructor(
    gpt: Gpt,
    readonly prompt: string,
    readonly newKvCacheKey: string,
  ) {
    super(async (): Promise<void> => {
      switch (gpt.driver.type) {
        case "local":
          return tauri.gptDecode(gpt.id, prompt, newKvCacheKey);
        case "remote":
          await remoteInferenceClient.gpt.decode(
            gpt.driver.baseUrl,
            gpt.id,
            prompt,
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
  name = "Inferring";

  constructor(
    gpt: Gpt,
    readonly prompt: string | undefined,
    readonly numEval: number,
    readonly options: InferOptions,
  ) {
    super(async (): Promise<string> => {
      switch (gpt.driver.type) {
        case "local":
          return tauri.gptInfer(gpt.id, prompt, numEval, options);
        case "remote":
          return (
            await remoteInferenceClient.gpt.infer(
              gpt.driver.baseUrl,
              gpt.id,
              prompt,
              numEval,
              options,
              { timeout: toMilliseconds({ minutes: 2 }) },
            )
          ).result;
        default:
          throw unreachable(gpt.driver);
      }
    });
  }
}

class GptCommitJob extends Job<number> {
  name = "Committing";

  constructor(gpt: Gpt, newKvCacheKey: string) {
    super(async (): Promise<number> => {
      switch (gpt.driver.type) {
        case "local":
          return tauri.gptCommit(gpt.id, newKvCacheKey);
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
 */
export class Gpt {
  /**
   * Create a new remote GPT session.
   */
  static async createRemote(
    inferenceServerBaseUrl: string,
    model: string,
  ): Promise<{ gpt: Gpt; kvCacheKey: null }> {
    const { id } = await remoteInferenceClient.gpt.create(
      inferenceServerBaseUrl,
      model,
    );

    return {
      gpt: new Gpt(id, {
        type: "remote",
        baseUrl: inferenceServerBaseUrl,
        model,
      }),
      kvCacheKey: null,
    };
  }

  /**
   * Create a new local GPT instance.
   *
   * @param localGptId The ID of the local GPT instance.
   * If the ID already exists, the instance will be reused
   * (would need to sync the context cache manually).
   */
  static async createLocal(
    localGptId: string,
    modelPath: string,
    contextSize: number,
    batchSize: number,
  ): Promise<{ gpt: Gpt; kvCacheKey: string | null }> {
    const kvCacheKey = await tauri.gptFindOrCreate(
      localGptId,
      modelPath,
      contextSize,
      batchSize,
    );

    return {
      gpt: new Gpt(localGptId, {
        type: "local",
        modelPath,
        contextSize,
        batchSize,
      }),
      kvCacheKey,
    };
  }

  private _id: string;
  private jobs = ref<GptJob[]>([]);
  private currentJob = ref<GptJob | null>(null);
  private willReset = ref(false);

  get id() {
    return this._id;
  }

  /**
   * Decode the prompt, updating the KV cache.
   */
  async decode(prompt: string, newKvCacheKey: string): Promise<void> {
    return this.pushJob(new GptDecodeJob(this, prompt, newKvCacheKey));
  }

  /**
   * Infer text from the prompt.
   */
  async infer(
    prompt: string | undefined,
    numEval: number,
    options: InferOptions = {},
  ): Promise<string> {
    return this.pushJob(new GptInferJob(this, prompt, numEval, options));
  }

  /**
   * Commit the latest inference result to the GPT's KV cache.
   */
  async commit(newKvCacheKey: string): Promise<number> {
    return this.pushJob(new GptCommitJob(this, newKvCacheKey));
  }

  /**
   * Reset the GPT.
   * For local GPT, would clear the KV cache.
   * For remote GPT, would delete the session and create a new one.
   */
  async reset(): Promise<void> {
    if (this.willReset.value) {
      while (this.willReset.value) {
        await sleep(100);
        return;
      }
    }

    // console.log(this.id, "Will reset...");
    this.willReset.value = true;

    // Wait for the current job to finish before resetting.
    while (this.currentJob.value) {
      await sleep(100);
    }

    this.willReset.value = false;

    switch (this.driver.type) {
      case "local":
        return tauri.gptReset(this.id);
      case "remote":
        await remoteInferenceClient.gpt.delete_(this.driver.baseUrl, this.id);

        this._id = (
          await remoteInferenceClient.gpt.create(
            this.driver.baseUrl,
            this.driver.model,
          )
        ).id;

        return;
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
        return tauri.gptTokenCount(this.driver.modelPath, prompt);
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
    readonly driver: Driver,
  ) {
    this._id = id;
  }

  private async pushJob<T>(job: Job<T>): Promise<T> {
    this.jobs.value.push(job as unknown as GptJob);
    this.wakeUp();
    return job.result;
  }

  // Wake up for a single job completion.
  private async wakeUp(): Promise<void> {
    while (this.currentJob.value) {
      await sleep(100);
    }

    let job = this.jobs.value.shift();
    if (job) {
      console.debug(this.id, "Performing job...", job.name);
      this.currentJob.value = job;

      try {
        const result = (await job.fn()) as any;
        // console.log(this.id, "Job result", job.name, result);
        job.deferred.resolve(result);
      } catch (error) {
        console.error(this.id, "Job error", job.name, error);
        this.jobs.value.length = 0; // Clear the queue.
        job.deferred.reject(error);
      } finally {
        if (this.willReset.value) {
          // console.log(this.id, "Resetting due to willReset...");
          this.jobs.value.length = 0; // Clear the queue.
          this.willReset.value = false;
        }

        this.currentJob.value = null;
      }
    } else {
      console.debug(this.id, "No jobs to do.");
    }
  }
}

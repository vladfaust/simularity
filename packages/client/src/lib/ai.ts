import { ref } from "vue";
import {
  InferOptions,
  gptCommit,
  gptDecode,
  gptFindOrCreate,
  gptInfer,
  gptReset,
  gptTokenCount,
} from "./tauri";
import { Deferred, sleep } from "./utils";

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
    super(() => gptDecode(gpt.id, prompt, newKvCacheKey));
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
    super(() => gptInfer(gpt.id, prompt, numEval, options));
  }
}

class GptCommitJob extends Job<number> {
  name = "Committing";

  constructor(gpt: Gpt, newKvCacheKey: string) {
    super(() => gptCommit(gpt.id, newKvCacheKey));
  }
}

export type GptJob = GptDecodeJob | GptInferJob | GptCommitJob;

export class Gpt {
  readonly jobs = ref<GptJob[]>([]);
  readonly currentJob = ref<GptJob | null>(null);
  readonly willReset = ref(false);

  static async findOrCreate(
    id: string,
    modelPath: string,
    contextSize: number,
    batchSize: number,
  ): Promise<{ gpt: Gpt; kvCacheKey: string }> {
    const kvCacheKey = await gptFindOrCreate(
      id,
      modelPath,
      contextSize,
      batchSize,
    );

    return {
      gpt: new Gpt(id, modelPath, contextSize, batchSize),
      kvCacheKey,
    };
  }

  private constructor(
    readonly id: string,
    readonly modelPath: string,
    readonly contextSize: number,
    readonly batchSize: number,
  ) {}

  /**
   * @see {@link gptDecode}.
   */
  async decode(prompt: string, newKvCacheKey: string): Promise<void> {
    return this.pushJob(new GptDecodeJob(this, prompt, newKvCacheKey));
  }

  /**
   * @see {@link gptInfer}.
   */
  async infer(
    prompt: string | undefined,
    numEval: number,
    options: InferOptions = {},
  ): Promise<string> {
    return this.pushJob(new GptInferJob(this, prompt, numEval, options));
  }

  /**
   * @see {@link gptCommit}.
   */
  async commit(newKvCacheKey: string): Promise<number> {
    return this.pushJob(new GptCommitJob(this, newKvCacheKey));
  }

  /**
   * @see {@link gptReset}.
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
    return gptReset(this.id);
  }

  /**
   * @see {@link gptTokenCount}.
   */
  async tokenCount(prompt: string): Promise<number> {
    return await gptTokenCount(this.modelPath, prompt);
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

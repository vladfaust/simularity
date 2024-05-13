import { GPT_DIRECTOR, GPT_WRITER } from "@/env";
import { ref } from "vue";
import {
  InferOptions,
  gptClear,
  gptCommit,
  gptDecode,
  gptInfer,
  gptInit,
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
  ) {
    super(() => gptDecode(gpt.id, prompt));
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

  constructor(gpt: Gpt) {
    super(() => gptCommit(gpt.id));
  }
}

export type GptJob = GptDecodeJob | GptInferJob | GptCommitJob;

export class Gpt {
  readonly jobs = ref<GptJob[]>([]);
  readonly initialized = ref(false);
  readonly currentJob = ref<GptJob | null>(null);
  readonly willClear = ref(false);

  constructor(
    readonly id: string,
    readonly modelPath: string,
    readonly contextSize: number,
    readonly batchSize: number,
  ) {
    this.init();
  }

  async decode(prompt: string): Promise<void> {
    return this.pushJob(new GptDecodeJob(this, prompt));
  }

  async infer(
    prompt: string | undefined,
    numEval: number,
    options: InferOptions = {},
  ): Promise<string> {
    return this.pushJob(new GptInferJob(this, prompt, numEval, options));
  }

  async commit(): Promise<number> {
    return this.pushJob(new GptCommitJob(this));
  }

  async clear(): Promise<void> {
    if (this.willClear.value) {
      while (this.willClear.value) {
        await sleep(100);
        return;
      }
    }

    console.log(this.id, "Will clear...");
    this.willClear.value = true;

    // Wait for the current job to finish before clearing.
    while (this.currentJob.value) {
      await sleep(100);
    }

    this.willClear.value = false;
    return gptClear(this.id);
  }

  async tokenCount(prompt: string): Promise<number> {
    return await gptTokenCount(this.modelPath, prompt);
  }

  private async init() {
    console.log(this.id, "Initializing...");
    await gptInit(this.id, this.modelPath, this.contextSize, this.batchSize);
    this.initialized.value = true;
  }

  private async pushJob<T>(job: Job<T>): Promise<T> {
    this.jobs.value.push(job as unknown as GptJob);
    this.wakeUp();
    return job.result;
  }

  // Wake up for a single job completion.
  private async wakeUp(): Promise<void> {
    while (!this.initialized.value || this.currentJob.value) {
      await sleep(100);
    }

    let job = this.jobs.value.shift();
    if (job) {
      console.log(this.id, "Performing job...", job.name);
      this.currentJob.value = job;

      try {
        const result = (await job.fn()) as any;
        console.log(this.id, "Job result", job.name, result);
        job.deferred.resolve(result);
      } catch (error) {
        console.error(this.id, "Job error", job.name, error);
        this.jobs.value.length = 0; // Clear the queue.
        job.deferred.reject(error);
      } finally {
        if (this.willClear.value) {
          console.log(this.id, "Clearing due to willClear...");
          this.jobs.value.length = 0; // Clear the queue.
          this.willClear.value = false;
        }

        this.currentJob.value = null;
      }
    } else {
      console.log(this.id, "No jobs to do.");
    }
  }
}

export const writer = new Gpt(
  "writer",
  GPT_WRITER.modelPath,
  GPT_WRITER.contextSize,
  GPT_WRITER.batchSize,
);

export const director = new Gpt(
  "director",
  GPT_DIRECTOR.modelPath,
  GPT_DIRECTOR.contextSize,
  GPT_DIRECTOR.batchSize,
);

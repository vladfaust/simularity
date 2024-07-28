import {
  bufferToHex,
  Deferred,
  digest,
  sleep,
  timeoutSignal,
  trimEndAny,
  unreachable,
} from "@/lib/utils";
import { v } from "@/lib/valibot";
import { toMilliseconds } from "duration-fns";
import { computed, markRaw, readonly, Ref, ref } from "vue";
import { InferenceOptionsSchema } from "./common";
import * as local from "./local";
import * as remote from "./remote";

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
    };

export type StoredGptSession = {
  id: string;
  driver: GptDriver;
  staticPromptHash: string | undefined;
  dynamicPromptHash: string | undefined;
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
    abortSignal?: AbortSignal,
  ) {
    super(async (): Promise<string> => {
      const progressCallback = (event: { progress: number }) => {
        this.progress.value = event.progress;
        progressCallback_?.(event);
      };

      switch (gpt.driver.type) {
        case "local": {
          const { modelId } = await local.gpt.loadModel(gpt.driver.modelPath);

          // TODO: Handle `abortSignal`.
          const { sessionId } = await local.gpt.create(
            modelId,
            gpt.driver.contextSize,
            initialPrompt,
            progressCallback,
            dumpSession,
          );

          this.progress.value = 1;
          return sessionId;
        }

        case "remote": {
          const id = (
            await remote.gpt.create(
              gpt.driver.baseUrl,
              {
                model: gpt.driver.model,
                initialPrompt,
              },
              { abortSignal },
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

type DecodeResult = {
  contextLength: number;
};

export class GptDecodeJob extends Job<DecodeResult> {
  readonly progress = ref(0);

  constructor(
    gpt: Gpt,
    readonly prompt: string,
    readonly decodeCallback_?: (event: { progress: number }) => void,
    abortSignal?: AbortSignal,
  ) {
    super(async (): Promise<DecodeResult> => {
      if (!gpt.isInitialized.value) {
        throw new Error("GPT is not initialized.");
      }

      const decodeCallback = (event: { progress: number }) => {
        this.progress.value = event.progress;
        decodeCallback_?.(event);
      };

      switch (gpt.driver.type) {
        case "local":
          // TODO: Handle `abortSignal`.
          return local.gpt.decode(gpt.id.value!, prompt, decodeCallback);
        case "remote":
          return remote.gpt.decode(
            gpt.driver.baseUrl,
            gpt.id.value!,
            { prompt },
            { abortSignal },
            decodeCallback,
          );
        default:
          throw unreachable(gpt.driver);
      }
    });
  }
}

type InferenceResult = {
  result: string;
  contextLength: number;
  // TODO: aborted: boolean;
};

export class GptInferJob extends Job<InferenceResult> {
  readonly decodeProgress: Ref<number | undefined>;

  constructor(
    gpt: Gpt,
    readonly prompt: string | null,
    readonly nEval: number,
    readonly options: v.InferInput<typeof InferenceOptionsSchema>,
    decodeCallback_?: (event: { progress: number }) => void,
    inferenceCallback_?: (event: { content: string }) => void,
    inferenceAbortSignal?: AbortSignal,
    fetchAbortSignal?: AbortSignal,
  ) {
    super(async (): Promise<InferenceResult> => {
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
          return local.gpt.infer(
            gpt.id.value!,
            prompt,
            nEval,
            options,
            decodeCallback,
            inferenceCallback,
            inferenceAbortSignal,
          );
        case "remote":
          // There is no way to abort inference on
          // the remote host inside the same request.
          // Therefore, we need to send another, abort, request.
          //

          inferenceAbortSignal?.addEventListener("abort", () => {
            if (gpt.driver.type !== "remote") {
              throw new Error("(Bug) GPT driver type is not remote");
            }

            remote.gpt.abortInference(gpt.driver.baseUrl, gpt.id.value!);
          });

          return remote.gpt.infer(
            gpt.driver.baseUrl,
            gpt.id.value!,
            { prompt, nEval, options },
            { abortSignal: fetchAbortSignal },
            decodeCallback,
            inferenceCallback,
          );
        default:
          throw unreachable(gpt.driver);
      }
    });

    this.decodeProgress = ref(prompt ? 0 : undefined);
  }
}

type GptJob = GptInitJob | GptDecodeJob | GptInferJob;

/**
 * A GPT instance, routing requests to the appropriate backend (local or remote).
 * It features a job queue to ensure that only one job is running at a time.
 */
export class Gpt {
  /**
   * Find an existing GPT instance by ID.
   * @param prompt Set the found GPT's prompt value.
   */
  static async find(
    driver: GptDriver,
    id: string,
    prompt: string | undefined,
  ): Promise<Gpt | null> {
    let found = false;

    switch (driver.type) {
      case "local":
        found = await local.gpt.find(id);
        break;
      case "remote":
        found = await remote.gpt.find(driver.baseUrl, id);
        break;
      default:
        throw unreachable(driver);
    }

    return found ? new Gpt(driver, id, prompt) : null;
  }

  /**
   * Create a new GPT instance. Returns immediately
   * after the session is created, initializing in background.
   *
   * @param initialPrompt If set, would try to preload the session,
   * or decode from scratch.
   *
   * @param dumpSession If set, would dump the session to disk.
   * Ignored for remote inference.
   */
  static async create(
    driver: GptDriver,
    initialPrompt: string | undefined,
    initProgressCallback: (event: { progress: number }) => void | undefined,
    dumpSession: boolean | undefined,
    onInitCallback?: (gpt: Gpt) => void,
  ): Promise<Gpt> {
    const gpt = new Gpt(driver, undefined, initialPrompt);

    gpt
      .initialize(dumpSession, initProgressCallback)
      .then(() => onInitCallback?.(gpt));

    return gpt;
  }

  /**
   * Find an existing GPT instance by ID, or create a new one.
   * If a session is found, it would be restored and reused.
   * Restored sessions are compared by prompt hashes.
   *
   * @param staticPrompt Static prompt to compare with the existing session.
   * @param dynamicPrompt Dynamic prompt to compare with the existing session
   * (appended to the static prompt to form the full prompt).
   */
  static async findOrCreate(
    driver: GptDriver,
    sessionRef: Ref<StoredGptSession | null>,
    staticPrompt: string,
    dynamicPrompt: string,
    progressCallback: (event: { progress: number }) => void,
  ) {
    let gpt: Gpt | null = null;
    let restored = false;
    let needDecode = true;

    const staticPromptHash = bufferToHex(await digest(staticPrompt, "SHA-256"));

    if (sessionRef.value) {
      const areDriversEqual = driversEqual(sessionRef.value.driver, driver);

      if (areDriversEqual) {
        gpt = await Gpt.find(
          driver,
          sessionRef.value.id,
          staticPrompt + dynamicPrompt,
        );
        restored = !!gpt;

        if (gpt) {
          console.log("Found GPT session", driver, gpt.id);

          if (sessionRef.value.staticPromptHash === staticPromptHash) {
            const dynamicPromptHash = bufferToHex(
              await digest(dynamicPrompt, "SHA-256"),
            );

            if (sessionRef.value.dynamicPromptHash === dynamicPromptHash) {
              console.info("GPT session full prompt match", dynamicPromptHash);
              needDecode = false;
            } else {
              console.info(
                "GPT session dynamic prompt mismatch, need decode",
                sessionRef.value.dynamicPromptHash,
                dynamicPromptHash,
              );
            }
          } else {
            console.info(
              "GPT static prompt mismatch, will destroy the session",
              sessionRef.value.staticPromptHash,
              staticPromptHash,
            );

            gpt.destroy();
            gpt = null;
            restored = false;
            sessionRef.value = null;
          }
        }
      } else {
        console.warn("GPT driver mismatch", sessionRef.value.driver, driver);

        sessionRef.value = null;
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

          sessionRef.value = {
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

  private readonly _prompt = ref("");

  /**
   * The committed (i.e. KV-cached) prompt, synchronized with the GPT instance.
   */
  readonly prompt = readonly(this._prompt);

  get contextSize() {
    switch (this.driver.type) {
      case "local":
        return this.driver.contextSize;
      case "remote":
        return 0; // TODO: Fetch the context size from the remote host.
      default:
        throw unreachable(this.driver);
    }
  }

  /**
   * Decode the prompt, updating the session KV cache.
   * @param prompt *Whole* prompt to decode.
   */
  // TODO: Return the new KV cache size.
  async decode(
    prompt: string,
    callback?: (event: { progress: number }) => void,
  ): Promise<DecodeResult> {
    const result = await this.pushJob(
      markRaw(
        new GptDecodeJob(
          this,
          prompt,
          callback,
          timeoutSignal(toMilliseconds({ minutes: 2 })),
        ),
      ),
    );

    this._prompt.value = prompt;
    return result;
  }

  /**
   * Predict the next token(s) given a prompt.
   *
   * @param prompt *Whole* prompt to infer from.
   * @param nEval Number of evaluations to perform.
   * @param inferenceAbortSignal Signal to abort the inference.
   * @param fetchAbortSignal Signal to abort the fetch.
   */
  async infer(
    prompt: string | null,
    nEval: number,
    options: v.InferInput<typeof InferenceOptionsSchema> = {},
    decodeCallback?: (event: { progress: number }) => void,
    inferenceCallback_?: (event: { content: string }) => void,
    inferenceAbortSignal?: AbortSignal,
    fetchAbortSignal: AbortSignal | undefined = timeoutSignal(
      toMilliseconds({
        minutes: 2,
      }),
    ),
  ): Promise<InferenceResult> {
    let decodeComplete = false;
    let result = await this.pushJob(
      markRaw(
        new GptInferJob(
          this,
          prompt,
          nEval,
          options,
          decodeCallback,
          (event) => {
            if (!decodeComplete) {
              // Reset the committed prompt.
              this._prompt.value = prompt || "";
              decodeComplete = true;
            }

            // Append the result to the committed prompt.
            this._prompt.value += event.content;

            inferenceCallback_?.(event);
          },
          inferenceAbortSignal,
          fetchAbortSignal,
        ),
      ),
    );

    // Trim the result by the stop sequences, if any.
    if (options.stopSequences) {
      result.result = trimEndAny(result.result, options.stopSequences);
    }

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
          return local.gpt.destroy(this.id.value);
        case "remote":
          return remote.gpt.destroy(this.driver.baseUrl, this.id.value);
        default:
          throw unreachable(this.driver);
      }
    } else {
      console.info("GPT instance not initialized, noop destroy");
    }
  }

  private constructor(
    driver: GptDriver,
    id: string | undefined,
    prompt: string | undefined,
  ) {
    this._id.value = id;
    this.driver = driver;
    this._prompt.value = prompt ?? "";
  }

  private async initialize(
    dumpSession?: boolean,
    progressCallback?: (event: { progress: number }) => void,
    abortSignal: AbortSignal | undefined = timeoutSignal(
      toMilliseconds({ minutes: 2 }),
    ),
  ): Promise<string> {
    return (this._id.value = await this.pushJob(
      markRaw(
        new GptInitJob(
          this,
          this.prompt.value,
          progressCallback,
          dumpSession,
          abortSignal,
        ),
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

/**
 * Compare two GPT drivers for equality.
 */
export function driversEqual(a: GptDriver, b: GptDriver): boolean {
  switch (a.type) {
    case "local":
      if (b.type !== "local") {
        return false;
      } else {
        return a.modelPath === b.modelPath && a.contextSize === b.contextSize;
      }
    case "remote":
      if (b.type !== "remote") {
        return false;
      } else {
        return a.baseUrl === b.baseUrl && a.model === b.model;
      }
    default:
      throw unreachable(a);
  }
}

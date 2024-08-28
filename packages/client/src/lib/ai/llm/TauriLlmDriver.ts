import { d } from "@/lib/drizzle";
import * as tauri from "@/lib/tauri";
import { Bug, sleep } from "@/lib/utils";
import { eq } from "drizzle-orm";
import { computed, ref } from "vue";
import {
  LlmGrammarLang,
  LlmStatus,
  type BaseLlmDriver,
  type CompletionOptions,
  type CompletionProgressEventPayload,
  type CompletionResult,
  type DecodeProgressEventPayload,
} from "./BaseLlmDriver";

type InitializationCallback = ({
  internalSessionId,
  databaseSessionId,
}: {
  internalSessionId: string;
  databaseSessionId: number;
}) => void;

export type TauriLlmDriverConfig = {
  type: "local";
  modelPath: string;

  /**
   * May be larger than the model's training context window.
   */
  // TODO: In that case, use RoPE.
  contextSize: number;

  completionOptions?: Omit<CompletionOptions, "grammar" | "stopSequences">;
};

export class TauriLlmDriver implements BaseLlmDriver {
  /**
   * Find an existing TauriLlmDriver (GPT instance) by database session ID.
   * Note that the sessions are cleared upon application restart;
   * therefore, if found, the session is guaranteed to be active,
   * and doesn't need a warmup.
   *
   * @param config Configuration of the driver, to validate against the session.
   */
  static async find(
    latestSessionDatabaseId: number,
    config: TauriLlmDriverConfig,
  ): Promise<TauriLlmDriver | null> {
    const dbSession = await d.db.query.llmLocalSessions.findFirst({
      where: eq(d.llmLocalSessions.id, latestSessionDatabaseId),
      columns: {
        internalId: true,
        modelPath: true,
        modelHash: true,
        contextSize: true,
      },
    });

    if (!dbSession) {
      console.warn(`Session not found in DB`, {
        dbSessionId: latestSessionDatabaseId,
      });

      return null;
    }

    if (dbSession.modelPath !== config.modelPath) {
      console.warn(`Config model path mismatch`, {
        dbSessionId: latestSessionDatabaseId,
        dbSessionModelPath: dbSession.modelPath,
        configModelPath: config.modelPath,
      });

      return null;
    }

    if (dbSession.contextSize !== config.contextSize) {
      console.warn(`Config context size mismatch`, {
        dbSessionId: latestSessionDatabaseId,
        dbSessionContextSize: dbSession.contextSize,
        configContextSize: config.contextSize,
      });

      return null;
    }

    const internalSession = await tauri.gpt.find(dbSession.internalId);

    if (internalSession) {
      console.debug({ internalSession });

      const { xx64Hash } = await tauri.gpt.getModelHashById(
        internalSession.modelId,
      );

      if (dbSession.modelHash !== xx64Hash) {
        console.warn(`Model hash mismatch`, {
          expected: dbSession.modelHash,
          actual: xx64Hash,
        });

        return null;
      }

      return new TauriLlmDriver(config, {
        internalSessionId: dbSession.internalId,
        databaseSessionId: latestSessionDatabaseId,
      });
    } else {
      console.log(`Session not found in Tauri`, {
        dbSessionId: latestSessionDatabaseId,
        internalId: dbSession.internalId,
      });

      return null;
    }
  }

  /**
   * Create a new TauriLlmDriver (GPT instance) from a configuration.
   * Initialization may be postponed until the first completion request,
   * yet initialization params are required to be passed now.
   */
  static create(
    config: TauriLlmDriverConfig,
    initializationParams: {
      initialPrompt: string;
      dumpSession: boolean;
      callback: InitializationCallback;
    },
    initializeNow: boolean,
  ): TauriLlmDriver {
    const driver = new TauriLlmDriver(config, initializationParams);
    if (initializeNow) driver._init();
    return driver;
  }

  private async _init() {
    if ("internalSessionId" in this._initializationParams) {
      throw new Error(`Already initialized`);
    }

    console.log("Initializing TauriLlmDriver...", {
      modelPath: this.config.modelPath,
      contextSize: this.config.contextSize,
    });

    try {
      this.busy.value = true;
      this.status.value = LlmStatus.Decoding;

      const { modelId, nCtxTrain } = await tauri.gpt.loadModel(
        this.config.modelPath,
      );

      if (this.config.contextSize > nCtxTrain) {
        console.warn(
          `Context size ${this.config.contextSize} is larger than the model's context window ${nCtxTrain}. Expect suboptimal performance.`,
        );
      }

      const modelHashPromise = tauri.gpt.getModelHashById(modelId);

      this.progress.value = 0;
      const result = await tauri.gpt.create(
        modelId,
        this.config.contextSize,
        this._initializationParams.initialPrompt,
        (e) => (this.progress.value = e.progress),
        this._initializationParams.dumpSession,
      );
      this.progress.value = 1;

      const internalSessionId = result.sessionId;
      const databaseSessionId = (
        await d.db
          .insert(d.llmLocalSessions)
          .values({
            internalId: result.sessionId,
            modelPath: this.config.modelPath,
            modelHash: (await modelHashPromise).xx64Hash,
            contextSize: this.config.contextSize,
          })
          .returning({ id: d.llmLocalSessions.id })
      )[0].id;

      this._initializationParams.callback({
        internalSessionId,
        databaseSessionId,
      });

      this._initializationParams = {
        internalSessionId,
        databaseSessionId,
      };
    } finally {
      this.status.value = undefined;
      this.progress.value = undefined;
      this.busy.value = false;
    }
  }

  readonly grammarLang = LlmGrammarLang.Gnbf;
  readonly needsWarmup = true;
  readonly initialized = computed(
    () => "internalSessionId" in this._initializationParams,
  );
  readonly busy = ref(false);
  readonly status = ref<LlmStatus | undefined>();
  readonly ready = computed(() => !this.busy.value);
  readonly progress = ref<number | undefined>();
  private _destroyed = false;

  get contextSize() {
    return this.config.contextSize;
  }

  private constructor(
    readonly config: TauriLlmDriverConfig,
    private _initializationParams:
      | {
          initialPrompt: string;
          dumpSession: boolean;
          callback: InitializationCallback;
        }
      | {
          internalSessionId: string;
          databaseSessionId: number;
        },
  ) {}

  compareConfig(other: TauriLlmDriverConfig): boolean {
    return (
      other.modelPath === this.config.modelPath &&
      other.contextSize === this.config.contextSize
    );
  }

  async createCompletion(
    prompt: string,
    nEval: number,
    inferenceOptions: CompletionOptions,
    decodeCallback?: (event: DecodeProgressEventPayload) => void,
    completionCallback?: (event: CompletionProgressEventPayload) => void,
    abortSignal?: AbortSignal,
  ): Promise<CompletionResult> {
    // Only one job at a time.
    while (this.busy.value) {
      await sleep(100);
    }

    if (this._destroyed) {
      // TODO: Handle this case gracefully.
      // E.g. there is a completion job queued, but the driver is destroyed.
      throw new Error(`Driver is already destroyed`);
    }

    // Postponed initialization.
    if (!this.initialized.value) {
      await this._init();
    }

    // Sanity check.
    if (!("internalSessionId" in this._initializationParams)) {
      throw new Bug("Not initialized (`internalSessionId` is missing)");
    }

    const startedAt = Date.now();
    try {
      this.busy.value = true;
      this.status.value = LlmStatus.Decoding;

      let decoded = false;

      const response = await tauri.gpt.infer(
        this._initializationParams.internalSessionId,
        prompt,
        nEval,
        inferenceOptions,
        (e) => {
          this.progress.value = e.progress;
          decodeCallback?.(e);
        },
        (e) => {
          if (!decoded) {
            this.progress.value = undefined;
            decodeCallback?.({ progress: 1 });
            decoded = true;
            this.status.value = LlmStatus.Inferring;
          }

          completionCallback?.(e);
        },
        abortSignal,
      );

      const completion = (
        await d.db
          .insert(d.llmCompletions)
          .values({
            localSessionId: this._initializationParams.databaseSessionId,
            options: inferenceOptions,
            input: prompt,
            inputLength: response.inputContextLength,
            output: response.result,
            outputLength: response.outputContextLength,
            error: abortSignal?.aborted ? "Aborted" : undefined,
            realTime: Date.now() - startedAt,
          })
          .returning()
      )[0];

      return {
        completion,
        aborted: abortSignal?.aborted ?? false,
      };
    } catch (e: any) {
      await d.db.insert(d.llmCompletions).values({
        localSessionId: this._initializationParams.databaseSessionId,
        options: inferenceOptions,
        input: prompt,
        error: e.message,
        executionTime: Date.now() - startedAt,
      });

      throw e;
    } finally {
      this.status.value = undefined;
      this.progress.value = undefined;
      this.busy.value = false;
    }
  }

  async destroy() {
    if (this._destroyed) {
      throw new Error(`Driver is already destroyed`);
    }

    this._destroyed = true;

    while (this.busy.value) {
      await sleep(100);
    }

    if ("internalSessionId" in this._initializationParams) {
      console.log("Destroying TauriLlmDriver session", {
        sessionId: this._initializationParams.internalSessionId,
      });

      await tauri.gpt.destroy(this._initializationParams.internalSessionId);
    }
  }
}

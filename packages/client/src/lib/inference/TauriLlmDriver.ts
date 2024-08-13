import { computed, ref } from "vue";
import * as tauri from "../tauri";
import { sleep } from "../utils";
import {
  BaseLlmDriver,
  CompletionOptions,
  CompletionProgressEventPayload,
  DecodeProgressEventPayload,
  LlmGrammarLang,
} from "./BaseLlmDriver";

type TauriLlmDriverOptions = Omit<
  CompletionOptions,
  "grammar" | "stopSequences"
>;

export type TauriLlmDriverConfig = {
  type: "tauri";
  modelPath: string;
  contextSize: number;
  options?: TauriLlmDriverOptions;
};

export class TauriLlmDriver implements BaseLlmDriver {
  /**
   * Find an existing TauriLlmDriver (GPT instance) by session ID.
   * Note that the sessions are cleared upon application restart;
   * therefore, if found, the session is guaranteed to be active,
   * and doesn't need a warmup.
   *
   * @param modelHash Expected model hash for sanity check.
   * If the model hash does not match, returns `null`.
   */
  static async find(
    config: TauriLlmDriverConfig,
    modelHash: string,
    sessionId: string,
  ): Promise<TauriLlmDriver | null> {
    const found = await tauri.gpt.find(sessionId);

    if (found) {
      const { xx64Hash } = await tauri.gpt.getModelHashById(found.modelId);
      if (modelHash !== xx64Hash) {
        console.warn(`Model hash mismatch.`, {
          expected: modelHash,
          actual: xx64Hash,
        });

        return null;
      }

      const { nCtxTrain } = await tauri.gpt.loadModel(found.modelId);
      if (nCtxTrain !== config.contextSize) {
        console.warn(`Context size mismatch.`, {
          expected: config.contextSize,
          actual: nCtxTrain,
        });

        return null;
      }

      return new TauriLlmDriver(sessionId, config);
    } else {
      return null;
    }
  }

  /**
   * Create a new TauriLlmDriver (GPT instance) from a configuration.
   * Will initialize in the background.
   *
   * @param initialPrompt Initial prompt to seed the model.
   * May take time to initialize, unless the session was dumped before.
   * @param dumpSession Whether to dump the session to disk.
   */
  static create(
    config: TauriLlmDriverConfig,
    initialPrompt: string,
    dumpSession: boolean,
  ): TauriLlmDriver {
    const driver = new TauriLlmDriver(undefined, config);
    driver._init(initialPrompt, dumpSession);
    return driver;
  }

  private async _init(initialPrompt: string, dumpSession: boolean) {
    this.busy.value = true;
    try {
      const { modelId, nCtxTrain } = await tauri.gpt.loadModel(
        this.config.modelPath,
      );

      if (this.config.contextSize > nCtxTrain) {
        console.warn(
          `Context size ${this.config.contextSize} is larger than the model's context window ${nCtxTrain}. Expect suboptimal performance.`,
        );
      }

      this.progress.value = 0;
      const result = await tauri.gpt.create(
        modelId,
        this.config.contextSize,
        initialPrompt,
        (e) => (this.progress.value = e.progress),
        dumpSession,
      );

      this.sessionId = result.sessionId;
      this.initialized.value = true;
    } finally {
      this.progress.value = undefined;
      this.busy.value = false;
    }
  }

  readonly grammarLang = LlmGrammarLang.Gnbf;
  readonly needsWarmup = true;
  readonly initialized = ref(false);
  readonly busy = ref(false);
  readonly ready = computed(() => this.initialized.value && !this.busy.value);
  readonly progress = ref<number | undefined>();

  get contextSize() {
    return this.config.contextSize;
  }

  private constructor(
    private sessionId: string | undefined,
    readonly config: TauriLlmDriverConfig,
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
  ): Promise<{
    result: string;
    totalTokens: number;
    aborted: boolean;
  }> {
    if (!this.sessionId) {
      throw new Error("TauriLlmDriver not initialized");
    }

    this.busy.value = true;
    try {
      let decoded = false;
      const response = await tauri.gpt.infer(
        this.sessionId,
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
          }

          completionCallback?.(e);
        },
        abortSignal,
      );

      return {
        result: response.result,
        totalTokens: response.contextLength,
        aborted: abortSignal?.aborted ?? false,
      };
    } finally {
      this.progress.value = undefined;
      this.busy.value = false;
    }
  }

  async destroy() {
    while (this.busy.value) {
      await sleep(100);
    }

    if (this.sessionId) {
      console.log("Destroying TauriLlmDriver session", {
        sessionId: this.sessionId,
      });

      await tauri.gpt.destroy(this.sessionId);
    }
  }
}

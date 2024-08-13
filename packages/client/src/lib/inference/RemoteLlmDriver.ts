import * as api from "@/lib/api";
import { toMilliseconds } from "duration-fns";
import { ref } from "vue";
import { mergeAbortSignals, timeoutSignal } from "../utils";
import {
  BaseLlmDriver,
  CompletionOptions,
  CompletionProgressEventPayload,
  DecodeProgressEventPayload,
  LlmGrammarLang,
} from "./BaseLlmDriver";

export type RemoteLlmDriverConfig = {
  type: "remote";
  baseUrl: string;
  jwt: string;
  modelId: string;
};

export class RemoteLlmDriver implements BaseLlmDriver {
  readonly busy = ref(false);

  static async create(config: RemoteLlmDriverConfig, sessionId?: string) {
    const models = await api.v1.models.index(config.baseUrl);
    const model = models.find((model) => model.id === config.modelId);
    if (!model) {
      throw new Error(`Model ${config.modelId} not found`);
    }

    return new RemoteLlmDriver(config, model.contextSize, sessionId);
  }

  readonly grammarLang = LlmGrammarLang.Regex;
  readonly needsWarmup = false;
  readonly ready = ref(true);
  readonly progress = ref<number | undefined>();
  private _sessionId?: string;
  get sessionId() {
    return this._sessionId;
  }

  private constructor(
    readonly config: RemoteLlmDriverConfig,
    readonly contextSize: number,
    sessionId?: string,
  ) {
    this._sessionId = sessionId;
  }

  compareConfig(other: RemoteLlmDriverConfig): boolean {
    return (
      other.modelId === this.config.modelId &&
      other.baseUrl === this.config.baseUrl
    );
  }

  // TODO: Support streaming progress events.
  async createCompletion(
    prompt: string,
    nEval: number,
    inferenceOptions: CompletionOptions,
    _decodeCallback?: (event: DecodeProgressEventPayload) => void,
    _completionCallback?: (event: CompletionProgressEventPayload) => void,
    abortSignal?: AbortSignal,
  ): Promise<{
    result: string;
    totalTokens: number;
    aborted: boolean;
  }> {
    try {
      this.busy.value = true;

      const fetchTimeout = timeoutSignal(toMilliseconds({ minutes: 5 }));
      let signal;
      if (abortSignal) {
        signal = mergeAbortSignals(abortSignal, fetchTimeout);
      } else {
        signal = fetchTimeout;
      }

      const response = await api.v1.completions.create(
        this.config.baseUrl,
        this.config.jwt,
        this._sessionId,
        {
          model: this.config.modelId,
          prompt: prompt,
          temperature: inferenceOptions.temp,
          guided_regex: inferenceOptions.grammar,
          max_tokens: nEval,
          min_p: inferenceOptions.minP,
          presence_penalty: inferenceOptions.penalty?.present,
          repetition_penalty: inferenceOptions.penalty?.repeat,
          stop: inferenceOptions.stopSequences,
          top_k: inferenceOptions.topK,
          top_p: inferenceOptions.topP,
        },
        signal,
      );

      this._sessionId = response.sessionId;

      return {
        result: response.output,
        totalTokens: response.usage.totalTokens,
        aborted: abortSignal?.aborted ?? false,
      };
    } finally {
      this.busy.value = false;
    }
  }

  async destroy(): Promise<void> {
    // Do nothing.
  }
}

import * as api from "@/lib/api";
import { toMilliseconds } from "duration-fns";
import { Ref, ref } from "vue";
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
  modelId: string;
};

export class RemoteLlmDriver implements BaseLlmDriver {
  readonly busy = ref(false);

  static async create(
    config: RemoteLlmDriverConfig,
    jwt: Readonly<Ref<string | null>>,
    sessionId: Ref<string | null>,
  ) {
    const models = await api.v1.models.index(config.baseUrl);
    const model = models.find((model) => model.id === config.modelId);
    if (!model) {
      throw new Error(`Model ${config.modelId} not found`);
    }

    return new RemoteLlmDriver(config, model.contextSize, jwt, sessionId);
  }

  readonly grammarLang = LlmGrammarLang.Regex;
  readonly needsWarmup = false;
  readonly ready = ref(true);
  readonly progress = ref<number | undefined>();

  private constructor(
    readonly config: RemoteLlmDriverConfig,
    readonly contextSize: number,
    readonly jwt: Readonly<Ref<string | null>>,
    readonly sessionId: Ref<string | null>,
  ) {}

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
    if (!this.jwt.value) {
      throw new Error("JWT token not set");
    }

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
        this.jwt.value,
        this.sessionId.value ?? undefined,
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

      this.sessionId.value = response.sessionId;

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

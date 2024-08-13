import { Ref } from "vue";
import { v } from "../valibot";

export class CompletionAbortError extends Error {
  constructor(
    readonly intermediateResult: {
      result: string;
      totalTokens: number;
      aborted: boolean;
    },
  ) {
    super(`Completion aborted`);
  }
}

export enum LlmGrammarLang {
  Gnbf,
  Lark,
  Regex,
}

export type DecodeProgressEventPayload = {
  progress: number;
};

export type CompletionProgressEventPayload = {
  content: string;
};

export const CompletionOptionsSchema = v.object({
  nPrev: v.optional(v.number()),
  nProbs: v.optional(v.number()),
  minKeep: v.optional(v.number()),
  topK: v.optional(v.number()),
  topP: v.optional(v.number()),
  minP: v.optional(v.number()),
  tfsZ: v.optional(v.number()),
  typicalP: v.optional(v.number()),
  temp: v.optional(v.number()),
  dynatemp: v.optional(
    v.object({
      range: v.optional(v.number()),
      exponent: v.optional(v.number()),
    }),
  ),
  penalty: v.optional(
    v.object({
      lastN: v.optional(v.number()),
      repeat: v.optional(v.number()),
      freq: v.optional(v.number()),
      present: v.optional(v.number()),
      penalizeNl: v.optional(v.boolean()),
    }),
  ),
  mirostat: v.optional(
    v.object({
      version: v.picklist(["v1", "v2"]),
      tau: v.optional(v.number()),
      eta: v.optional(v.number()),
    }),
  ),
  seed: v.optional(v.number()),
  grammar: v.optional(v.string()),
  stopSequences: v.optional(v.array(v.string())),
});

export type CompletionOptions = v.InferOutput<typeof CompletionOptionsSchema>;

export interface BaseLlmDriver {
  grammarLang: LlmGrammarLang;
  contextSize: number;
  needsWarmup: boolean;

  /**
   * Whether is the driver ready to accept new requests.
   */
  ready: Ref<boolean>;

  /**
   * Whether the driver is currently busy.
   * Note: it can be busy even when ready.
   */
  busy: Ref<boolean>;

  /**
   * Current progress of the driver, if any.
   * Can be undefined even when busy.
   */
  progress: Ref<number | undefined>;

  /**
   * Return whether the configuration of this driver is the same as the other.
   */
  compareConfig(other: any): boolean;

  createCompletion(
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
  }>;

  destroy(): Promise<void>;
}

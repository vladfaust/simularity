import type { d } from "@/lib/drizzle";
import { v } from "@/lib/valibot";
import { type Ref } from "vue";

export class CompletionAbortError extends Error {
  constructor() {
    super(`Completion aborted`);
  }
}

export enum LlmGrammarLang {
  Gnbf = "gbnf",
  Lark = "lark",
  Regex = "regex",
  JsonSchema = "json-schema",
  LuaGnbf = "lua-gbnf",
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
  grammar: v.optional(
    v.object({
      lang: v.enum(LlmGrammarLang),
      content: v.string(),
    }),
  ),
  stopSequences: v.optional(v.array(v.string())),
});

export type CompletionOptions = v.InferOutput<typeof CompletionOptionsSchema>;
export type CompletionResult = {
  completion: typeof d.llmCompletions.$inferSelect;
  aborted: boolean;
};

export enum LlmStatus {
  Queued,
  Initializing,
  Decoding,
  Inferring,
}

export interface BaseLlmDriver {
  modelId: string;
  supportedGrammarLangs: Set<LlmGrammarLang>;
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
   * Current status of the driver.
   */
  status: Ref<LlmStatus | undefined>;

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
  ): Promise<CompletionResult>;

  destroy(): Promise<void>;
}

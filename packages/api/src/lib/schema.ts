import * as v from "valibot";

export * as commands from "./schema/commands.js";
export * as scenarios from "./schema/scenarios.js";

export * from "./schema/common.js";

export const LlmCompletionParamsSchema = v.object({
  // OpenAI-compatible.
  max_tokens: v.optional(v.number()),
  presence_penalty: v.optional(v.number()),
  stop: v.optional(v.array(v.string())),
  temperature: v.optional(v.number()),
  top_p: v.optional(v.number()),

  // vLLM-specific.
  top_k: v.optional(v.number()),
  min_p: v.optional(v.number()),
  repetition_penalty: v.optional(v.number()),
  stop_token_ids: v.optional(v.array(v.number())),
  include_stop_str_in_output: v.optional(v.boolean()),
  min_tokens: v.optional(v.number()),
  guided_grammar: v.optional(v.string()),
  guided_regex: v.optional(v.string()),
  guided_json: v.optional(v.string()),
});

export const TtsParamsSchema = v.strictObject({
  text: v.string(),
  language: v.string(),
  add_wav_header: v.optional(v.boolean()),
  stream_chunk_size: v.optional(v.number()),
  overlap_wav_len: v.optional(v.number()),
  temperature: v.optional(v.number()),
  length_penalty: v.optional(v.number()),
  repetition_penalty: v.optional(v.number()),
  top_k: v.optional(v.number()),
  top_p: v.optional(v.number()),
  do_sample: v.optional(v.boolean()),
  speed: v.optional(v.number()),
  enable_text_splitting: v.optional(v.boolean()),
});

export const OAuthProviderIdSchema = v.picklist(["patreon"]);

export type Text2TextCompletionEpilogue = {
  type: "epilogue";
  sessionId: string;
  completionId: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    delayTime: number;
    executionTime: number;
    creditCost: string | null;
  };
};

export type Text2SpeechCompletionEpilogue = {
  type: "epilogue";
  inferenceId: string;
  usage: {
    delayTime: number | null;
    executionTime: number;
    creditCost: string | null;
  };
};

export const PatreonTier = v.object({
  id: v.string(),
  name: v.string(),
});

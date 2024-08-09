import { v } from "../../lib/valibot";

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
});

export const RequestBodySchema = v.object({
  model: v.string(),
  prompt: v.string(),
  ...LlmCompletionParamsSchema.entries,
});

export const ResponseSchema = v.object({
  sessionId: v.string(),
  completionId: v.string(),
  output: v.string(),
  usage: v.object({
    promptTokens: v.number(),
    completionTokens: v.number(),
    totalTokens: v.number(),
  }),
});

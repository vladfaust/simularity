import * as v from "valibot";

export const LocaleSchema = v.union([v.literal("en-US"), v.literal("ru-RU")]);
export const MultiLocaleTextSchema = v.record(
  LocaleSchema,
  v.pipe(v.string(), v.trim(), v.nonEmpty()),
);

export const CurrencySchema = v.union([v.literal("usd")]);
export const MultiCurrencyCostSchema = v.record(CurrencySchema, v.number());

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

import { v } from "../valibot";

export const InferenceOptionsSchema = v.object({
  stopSequences: v.optional(v.array(v.string())),
  grammar: v.optional(v.string()),
  temp: v.optional(v.number()),
  topK: v.optional(v.number()),
  minP: v.optional(v.number()),
  topP: v.optional(v.number()),
  tfsZ: v.optional(v.number()),
  typicalP: v.optional(v.number()),
  mirostat: v.optional(
    v.object({
      tau: v.number(),
      eta: v.number(),
    }),
  ),
});

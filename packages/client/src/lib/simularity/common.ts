import { v } from "@/lib/valibot";

export const InferenceOptionsSchema = v.object({
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

export type InferenceOptions = v.InferOutput<typeof InferenceOptionsSchema>;

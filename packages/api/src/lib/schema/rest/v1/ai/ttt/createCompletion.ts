import * as v from "valibot";

export const RequestBodySchema = v.object({
  model: v.string(),
  prompt: v.string(),
  nEval: v.number(),
  options: v.optional(
    v.object({
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
      stopSequences: v.optional(v.array(v.string())),
      grammar: v.optional(
        v.object({
          lang: v.union([
            v.literal("gbnf"),
            v.literal("lark"),
            v.literal("regex"),
            v.literal("json-schema"),
            v.literal("lua-gbnf"),
          ]),
          content: v.string(),
        }),
      ),
    }),
  ),
});

export const InferenceChunkSchema = v.object({
  done: v.literal(false),
  tokens: v.array(v.string()),
});

export const EpilogueSchema = v.object({
  done: v.literal(true),
  completionId: v.string(),
  usage: v.object({
    completionTokens: v.number(),
    delayTime: v.number(),
    executionTime: v.number(),
    promptTokens: v.number(),
    totalTokens: v.number(),
  }),
});

export const StreamSchema = v.variant("done", [
  InferenceChunkSchema,
  EpilogueSchema,
]);

import * as v from "valibot";

export const RequestBodySchema = v.strictObject({
  modelId: v.string(),
  speakerEmbedding: v.array(v.number()),
  gptCondLatent: v.array(v.array(v.number())),
  text: v.string(),
  locale: v.string(),
  streamChunkSize: v.optional(v.number()),
  overlapWavLen: v.optional(v.number()),
  temperature: v.optional(v.number()),
  lengthPenalty: v.optional(v.number()),
  repetitionPenalty: v.optional(v.number()),
  topK: v.optional(v.number()),
  topP: v.optional(v.number()),
  doSample: v.optional(v.boolean()),
  speed: v.optional(v.number()),
  enableTextSplitting: v.optional(v.boolean()),
});

export const InferenceChunkSchema = v.object({
  done: v.literal(false),
  chunkBase64: v.string(),
});

export const EpilogueSchema = v.object({
  done: v.literal(true),
  inferenceId: v.string(),
  usage: v.object({
    delayTime: v.number(),
    executionTime: v.number(),
  }),
});

export const StreamSchema = v.variant("done", [
  InferenceChunkSchema,
  EpilogueSchema,
]);

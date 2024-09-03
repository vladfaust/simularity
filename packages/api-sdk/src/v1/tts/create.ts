import * as v from "valibot";

// TODO: Cache embeddings w/ `speakerId`.
export const RequestBodySchema = v.strictObject({
  modelId: v.string(),
  speakerEmbedding: v.array(v.number()),
  gptCondLatent: v.array(v.array(v.number())),
  text: v.string(),
  language: v.string(),
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

export const ResponseBodySchema = v.object({
  inferenceId: v.string(),

  usage: v.object({
    delayTime: v.optional(v.number()),
    executionTime: v.number(),

    /**
     * Cost of the inference in credits.
     */
    creditCost: v.nullable(v.string()),
  }),

  output: v.object({
    /**
     * Base64-encoded WAV audio.
     */
    wavBase64: v.string(),

    /**
     * Duration of the generated audio in milliseconds.
     */
    wavDuration: v.number(),
  }),
});

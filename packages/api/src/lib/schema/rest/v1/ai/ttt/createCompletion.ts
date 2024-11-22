import * as v from "valibot";
import { LlmCompletionParamsSchema } from "../../../../common";

export const RequestBodySchema = v.object({
  model: v.string(),
  prompt: v.string(),
  ...LlmCompletionParamsSchema.entries,
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

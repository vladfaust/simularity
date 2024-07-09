import { env } from "@/env.js";
import { FetchError, ResponseOkError } from "../errors.js";
import { filterWhitespaceStrings } from "../utils.js";
import { v } from "../valibot.js";

export const OptionsSchema = v.object({
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

const RequestBodySchema = v.object({
  prompt: v.nullable(v.string()),
  nEval: v.number(),
  options: v.optional(OptionsSchema),
});

const ErrorChunkSchema = v.object({
  type: v.literal("Error"),
  error: v.string(),
});

const DecodeProgressChunkSchema = v.object({
  type: v.literal("Decoding"),
  progress: v.number(),
});

const InferenceChunkSchema = v.object({
  type: v.literal("Inference"),
  content: v.string(),
});

const EpilogueSchema = v.object({
  type: v.literal("Epilogue"),
  duration: v.number(),
  aborted: v.boolean(),
  tokenLength: v.number(),
  contextLength: v.number(),
});

const ChunkSchema = v.union([
  ErrorChunkSchema,
  DecodeProgressChunkSchema,
  InferenceChunkSchema,
  EpilogueSchema,
]);

export async function* infer(
  baseUrl: string,
  sessionId: number,
  args: v.InferInput<typeof RequestBodySchema>,
  options?: { abortSignal: AbortSignal },
): AsyncGenerator<v.InferOutput<typeof ChunkSchema>> {
  let response;
  try {
    response = await fetch(`${baseUrl}/gpts/${sessionId}/infer`, {
      method: "POST",
      headers: {
        Authorization: `Token ${env.INFERENCE_NODE_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...args, stream: true }),
      signal: options?.abortSignal,
    });
  } catch (e: any) {
    throw new FetchError(e.message);
  }

  if (!response.ok) {
    throw await ResponseOkError.from(response);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Response body is not readable.");
  }

  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    for (const text of filterWhitespaceStrings(
      decoder.decode(value).split("\n"),
    )) {
      const json = JSON.parse(text);
      const chunk = v.parse(ChunkSchema, json);
      yield chunk;
    }
  }
}

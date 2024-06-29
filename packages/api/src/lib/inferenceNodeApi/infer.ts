import { env } from "@/env.js";
import { FetchError, ResponseOkError } from "../errors.js";
import { filterWhitespaceStrings } from "../utils.js";
import { v } from "../valibot.js";

export const OptionsSchema = v.object({
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

const RequestBodySchema = v.object({
  prompt: v.nullable(v.string()),
  nEval: v.number(),
  options: OptionsSchema,
});

const DecodeProgressSchema = v.object({
  type: v.literal("Decoding"),
  progress: v.number(),
});

const InferenceSchema = v.object({
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
  DecodeProgressSchema,
  InferenceSchema,
  EpilogueSchema,
]);

export async function* infer(
  baseUrl: string,
  sessionId: string,
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

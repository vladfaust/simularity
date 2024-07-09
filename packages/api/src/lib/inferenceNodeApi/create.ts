import { env } from "@/env.js";
import { FetchError, ResponseOkError } from "../errors.js";
import { filterWhitespaceStrings } from "../utils.js";
import { v } from "../valibot.js";

const RequestBodySchema = v.object({
  modelId: v.string(),
  initialPrompt: v.optional(v.string()),
  dumpSession: v.optional(v.boolean()),
});

const ErrorChunkSchema = v.object({
  type: v.literal("Error"),
  error: v.string(),
});

const ProgressChunkSchema = v.object({
  type: v.literal("Progress"),
  progress: v.number(),
});

const EpilogueChunkSchema = v.object({
  type: v.literal("Epilogue"),
  sessionId: v.number(),
  sessionLoaded: v.nullable(v.boolean()),
  sessionDumpSize: v.nullable(v.number()),
  contextLength: v.number(),
});

const ChunkSchema = v.union([
  ErrorChunkSchema,
  ProgressChunkSchema,
  EpilogueChunkSchema,
]);

export async function* create(
  baseUrl: string,
  args: v.InferInput<typeof RequestBodySchema>,
  options?: { abortSignal: AbortSignal },
): AsyncGenerator<v.InferOutput<typeof ChunkSchema>> {
  let response;
  try {
    response = await fetch(`${baseUrl}/gpts`, {
      method: "POST",
      headers: {
        Authorization: `Token ${env.INFERENCE_NODE_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
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

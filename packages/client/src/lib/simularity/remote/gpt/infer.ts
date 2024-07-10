import { filterWhitespaceStrings, unreachable } from "@/lib/utils";
import { v } from "@/lib/valibot";
import { InferenceOptionsSchema } from "../../common";

const RequestBodySchema = v.object({
  prompt: v.nullable(v.string()),
  nEval: v.number(),
  options: InferenceOptionsSchema,
});

const ErrorChunkSchema = v.object({
  type: v.literal("error"),
  error: v.string(),
});

const DecodeProgressChunkSchema = v.object({
  type: v.literal("decodeProgress"),
  progress: v.number(),
});

const InferenceChunkSchema = v.object({
  type: v.literal("inference"),
  content: v.string(),
});

const EpilogueChunkSchema = v.object({
  type: v.literal("epilogue"),
  inferenceId: v.string(),
  duration: v.number(),
  contextLength: v.number(),
});

const ChunkSchema = v.union([
  ErrorChunkSchema,
  DecodeProgressChunkSchema,
  InferenceChunkSchema,
  EpilogueChunkSchema,
]);

export async function infer(
  baseUrl: string,
  gptId: string,
  body: v.InferInput<typeof RequestBodySchema>,
  options: { abortSignal?: AbortSignal },
  decodeCallback?: (event: { progress: number }) => void,
  inferenceCallback?: (event: { content: string }) => void,
): Promise<{
  inferenceId: string;
  result: string;
}> {
  const response = await fetch(`${baseUrl}/gpts/${gptId}/infer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: options.abortSignal,
  });

  if (!response.ok) {
    throw new Error(`Failed to infer: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("Response body is not readable.");

  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    for (const text of filterWhitespaceStrings(
      decoder.decode(value).split("\n"),
    )) {
      const json = JSON.parse(text);
      const chunk = v.parse(ChunkSchema, json);

      switch (chunk.type) {
        case "error":
          throw new Error(`Failed to infer: ${chunk.error}`);
        case "decodeProgress":
          decodeCallback?.(chunk);
          break;
        case "inference":
          result += chunk.content;
          inferenceCallback?.(chunk);
          break;
        case "epilogue":
          return {
            inferenceId: chunk.inferenceId,
            result,
          };
        default:
          throw unreachable(chunk);
      }
    }
  }

  throw new Error("Stream ended unexpectedly.");
}

export async function abortInference(
  baseUrl: string,
  gptId: string,
): Promise<void> {
  const response = await fetch(`${baseUrl}/gpts/${gptId}/abort-inference`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Failed to abort inference: ${response.statusText}`);
  }
}

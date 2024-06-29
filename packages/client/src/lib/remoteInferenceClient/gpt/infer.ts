import { InferenceOptionsSchema } from "@/lib/ai/common";
import { filterWhitespaceStrings, unreachable } from "@/lib/utils";
import { v } from "@/lib/valibot";

const RequestBodySchema = v.object({
  prompt: v.nullable(v.string()),
  nEval: v.number(),
  options: InferenceOptionsSchema,
});

const DecodeProgressSchema = v.object({
  type: v.literal("decodeProgress"),
  progress: v.number(),
});

const InferenceSchema = v.object({
  type: v.literal("inference"),
  content: v.string(),
});

const EpilogueSchema = v.object({
  type: v.literal("epilogue"),
  inferenceId: v.string(),
  duration: v.number(),
  contextLength: v.number(),
});

const ChunkSchema = v.union([
  DecodeProgressSchema,
  InferenceSchema,
  EpilogueSchema,
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

import { abortSignal, filterWhitespaceStrings, unreachable } from "@/lib/utils";
import { v } from "@/lib/valibot";

const RequestBodySchema = v.object({
  prompt: v.string(),
});

const ProgressSchema = v.object({
  type: v.literal("progress"),
  progress: v.number(),
});

const EpilogueSchema = v.object({
  type: v.literal("epilogue"),
  decodeId: v.string(),
  duration: v.number(),
  contextLength: v.number(),
});

const ChunkSchema = v.union([ProgressSchema, EpilogueSchema]);

export async function decode(
  baseUrl: string,
  gptId: string,
  body: v.InferInput<typeof RequestBodySchema>,
  options: { timeout: number },
  decodeCallback?: (event: { progress: number }) => void,
): Promise<{
  decodeId: string;
  duration: number;
  contextLength: number;
}> {
  const response = await fetch(`${baseUrl}/gpts/${gptId}/decode`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: abortSignal(options.timeout),
  });

  if (!response.ok) {
    throw new Error(`Failed to decode prompt: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("Response body is not readable.");

  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    for (const text of filterWhitespaceStrings(
      decoder.decode(value).split("\n"),
    )) {
      const json = JSON.parse(text);
      const chunk = v.parse(ChunkSchema, json);

      switch (chunk.type) {
        case "progress":
          decodeCallback?.(chunk);
          break;
        case "epilogue":
          return {
            decodeId: chunk.decodeId,
            duration: chunk.duration,
            contextLength: chunk.contextLength,
          };
        default:
          throw unreachable(chunk);
      }
    }
  }

  throw new Error("Stream ended unexpectedly.");
}

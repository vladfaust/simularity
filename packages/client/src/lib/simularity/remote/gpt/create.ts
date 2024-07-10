import { filterWhitespaceStrings, unreachable } from "@/lib/utils";
import { v } from "@/lib/valibot";

const RequestBodySchema = v.object({
  model: v.string(),

  /**
   * If set, would try loading the GPT session
   * from prompt's hash, otherwise decode from scratch.
   */
  initialPrompt: v.optional(v.string()),
});

const ErrorChunkSchema = v.object({
  type: v.literal("error"),
  error: v.string(),
});

const ProgressChunkSchema = v.object({
  type: v.literal("progress"),
  progress: v.number(), // 0-1
});

const EpilogueChunkSchema = v.object({
  type: v.literal("epilogue"),
  sessionId: v.string(),
  contextLength: v.number(),
});

const ChunkSchema = v.union([
  ErrorChunkSchema,
  ProgressChunkSchema,
  EpilogueChunkSchema,
]);

export async function create(
  baseUrl: string,
  body: v.InferInput<typeof RequestBodySchema>,
  options: { abortSignal?: AbortSignal },
  progressCallback?: (event: { progress: number }) => void,
): Promise<{
  sessionId: string;
  contextLength: number;
}> {
  const response = await fetch(`${baseUrl}/gpts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: options.abortSignal,
  });

  if (!response.ok) {
    throw new Error(`Failed to create GPT session: ${response.statusText}`);
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
        case "error":
          throw new Error(
            `Failed to create remote GPT session: ${chunk.error}`,
          );
        case "progress":
          progressCallback?.(chunk);
          break;
        case "epilogue":
          return {
            sessionId: chunk.sessionId,
            contextLength: chunk.contextLength,
          };
        default:
          throw unreachable(chunk);
      }
    }
  }

  throw new Error("Stream ended unexpectedly.");
}

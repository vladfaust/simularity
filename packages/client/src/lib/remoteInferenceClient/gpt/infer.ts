import { InferenceEvent } from "@/lib/ai";
import { InferenceOptionsSchema } from "@/lib/ai/common";
import { abortSignal, unreachable } from "@/lib/utils";
import { v } from "@/lib/valibot";

const RequestBodySchema = v.object({
  prompt: v.nullable(v.string()),
  nEval: v.number(),
  options: InferenceOptionsSchema,
  stream: v.boolean(),
});

const RequestBodyArgumentSchema = v.omit(RequestBodySchema, ["stream"]);

const ResponseBodySchema = v.object({
  inferenceId: v.string(),
  result: v.string(),
});

const StreamContentSchema = v.object({
  brand: v.literal("content"),
  content: v.string(),
});

const StreamEpilogueSchema = v.object({
  brand: v.literal("epilogue"),
  inferenceId: v.string(),
});

const StreamChunkSchema = v.union([StreamContentSchema, StreamEpilogueSchema]);

export async function infer(
  baseUrl: string,
  gptId: string,
  body: v.InferInput<typeof RequestBodyArgumentSchema>,
  options: { timeout: number },
  callback?: (event: InferenceEvent) => void,
): Promise<v.InferOutput<typeof ResponseBodySchema>> {
  const response = await fetch(`${baseUrl}/gpts/${gptId}/infer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...body, stream: !!callback }),
    signal: abortSignal(options.timeout),
  });

  if (!response.ok) {
    throw new Error(`Failed to infer: ${response.statusText}`);
  }

  if (callback) {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Response body is not readable.");

    let result = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = new TextDecoder().decode(value);
      const chunk = v.parse(StreamChunkSchema, JSON.parse(text));

      switch (chunk.brand) {
        case "content":
          result += chunk.content;
          callback({ content: chunk.content });
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

    throw new Error("Stream ended unexpectedly.");
  } else {
    return response.json().then((x) => v.parse(ResponseBodySchema, x));
  }
}

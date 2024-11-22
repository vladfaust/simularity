import { env } from "@/env";
import { v } from "@/lib/valibot";
import { rest } from "@simularity/api/lib/schema";

const schema = rest.v1.ai.ttt;

export async function createCompletion(
  body: v.InferOutput<typeof schema.RequestBodySchema>,
  options: {
    jwt: string;
    sessionId?: string;
    onInferenceChunk?: (
      chunk: v.InferOutput<typeof schema.InferenceChunkSchema>,
    ) => void;
  },
): Promise<{
  epilogue: v.InferOutput<typeof schema.EpilogueSchema>;
  sessionId: string;
}> {
  const response = await fetch(env.VITE_API_BASE_URL + "/rest/v1/ai/ttt", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.jwt}`,
      "X-Session-Id": options.sessionId ?? "",
    },
    body: JSON.stringify(
      body satisfies v.InferOutput<typeof schema.RequestBodySchema>,
    ),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  console.debug("1", response.headers);
  const sessionId = response.headers.get("x-Session-id")!;

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body reader");
  }

  let decoder = new TextDecoder();
  let buffer = "";
  let done = false;
  let epilogue: v.InferOutput<typeof schema.EpilogueSchema> | undefined;

  while (!done) {
    const { value, done: readerDone } = await reader.read();
    done = readerDone;

    if (value) {
      buffer += decoder.decode(value, { stream: !done });
    }

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const chunkObject = JSON.parse(line);
      const chunk = v.parse(schema.StreamSchema, chunkObject);

      if (chunk.done) {
        epilogue = chunk;
      } else {
        options.onInferenceChunk?.(chunk);
      }
    }

    if (done) {
      break;
    }
  }

  if (!epilogue) {
    throw new Error("No epilogue");
  }

  console.debug("2", response.headers);

  return {
    epilogue,
    sessionId,
  };
}

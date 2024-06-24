import { env } from "@/env.js";
import { toMilliseconds } from "duration-fns";
import { FetchError, ResponseOkError } from "../errors.js";
import { abortSignal, filterWhitespaceStrings } from "../utils.js";
import { v } from "../valibot.js";

const RequestBodySchema = v.object({
  prompt: v.string(),
});

const ProgressSchema = v.object({
  type: v.literal("Progress"),
  progress: v.number(),
});

const EpilogueSchema = v.object({
  type: v.literal("Epilogue"),
  duration: v.number(),
  contextLength: v.number(),
});

const ChunkSchema = v.union([ProgressSchema, EpilogueSchema]);

export async function* decode(
  baseUrl: string,
  sessionId: string,
  args: v.InferInput<typeof RequestBodySchema>,
  options: { timeout: number } = {
    timeout: toMilliseconds({ minutes: 2 }),
  },
): AsyncGenerator<v.InferOutput<typeof ChunkSchema>> {
  let response;
  try {
    response = await fetch(`${baseUrl}/gpts/${sessionId}/decode`, {
      method: "POST",
      headers: {
        Authorization: `Token ${env.INFERENCE_NODE_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      signal: abortSignal(options.timeout),
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

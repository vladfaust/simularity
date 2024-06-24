import { env } from "@/env.js";
import { toMilliseconds } from "duration-fns";
import { FetchError, ResponseOkError } from "../errors.js";
import { abortSignal, filterWhitespaceStrings } from "../utils.js";
import { v } from "../valibot.js";

const RequestBodySchema = v.object({
  id: v.string(),
  initialPrompt: v.optional(v.string()),
  dumpSession: v.optional(v.boolean()),
});

const DecodeProgressSchema = v.object({
  type: v.literal("Decode"),
  progress: v.number(),
});

const SessionLoadProgressSchema = v.object({
  type: v.literal("SessionLoad"),
  progress: v.number(),
});

const EpilogueSchema = v.object({
  type: v.literal("Epilogue"),
  sessionLoaded: v.nullable(v.boolean()),
  sessionDumpSize: v.nullable(v.number()),
  contextLength: v.number(),
});

const ChunkSchema = v.union([
  DecodeProgressSchema,
  SessionLoadProgressSchema,
  EpilogueSchema,
]);

export async function* create(
  baseUrl: string,
  args: v.InferInput<typeof RequestBodySchema>,
  options: { timeout: number } = {
    timeout: toMilliseconds({ minutes: 2 }),
  },
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

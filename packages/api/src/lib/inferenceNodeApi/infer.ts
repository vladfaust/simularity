import { env } from "@/env.js";
import { toMilliseconds } from "duration-fns";
import { FetchError, ResponseOkError } from "../errors.js";
import { abortSignal } from "../utils.js";
import { v } from "../valibot.js";

export const InferOptions = v.object({
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

const ResponseSchema = v.object({
  /**
   * Decoding duration in milliseconds.
   */
  duration: v.number(),

  /**
   * New KV (potentially committed) KV cache size in tokens.
   */
  kvCacheSize: v.number(),

  /**
   * Inference result.
   */
  result: v.string(),
});

export async function infer(
  baseUrl: string,
  sessionId: string,
  args: {
    prompt: string | null;
    nEval: number;
    options: v.InferOutput<typeof InferOptions>;
  },
  options: { timeout: number } = {
    timeout: toMilliseconds({ minutes: 2 }),
  },
): Promise<v.InferOutput<typeof ResponseSchema>> {
  let response;
  try {
    response = await fetch(`${baseUrl}/gpts/${sessionId}/infer`, {
      method: "POST",
      headers: {
        Authorization: `Token ${env.INFERENCE_NODE_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...args, stream: false }),
      signal: abortSignal(options.timeout),
    });
  } catch (e: any) {
    throw new FetchError(e.message);
  }

  if (!response.ok) {
    throw await ResponseOkError.from(response);
  }

  return await response.json().then((x) => v.parse(ResponseSchema, x));
}

const StreamResponseSchema = v.object({
  content: v.string(),
});

export async function* inferStream(
  baseUrl: string,
  sessionId: string,
  args: {
    prompt: string | null;
    nEval: number;
    options: v.InferOutput<typeof InferOptions>;
  },
  options: { timeout: number } = {
    timeout: toMilliseconds({ minutes: 2 }),
  },
): AsyncGenerator<v.InferOutput<typeof StreamResponseSchema>> {
  let response;
  try {
    response = await fetch(`${baseUrl}/gpts/${sessionId}/infer`, {
      method: "POST",
      headers: {
        Authorization: `Token ${env.INFERENCE_NODE_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...args, stream: true }),
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

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = new TextDecoder().decode(value);
    yield v.parse(StreamResponseSchema, JSON.parse(text));
  }
}

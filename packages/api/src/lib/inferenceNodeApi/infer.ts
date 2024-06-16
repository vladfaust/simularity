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
  args: {
    sessionId: string;
    prompt?: string;
    nEval: number;
    options: v.InferOutput<typeof InferOptions>;
  },
  options: { timeout: number } = {
    timeout: toMilliseconds({ minutes: 2 }),
  },
): Promise<v.InferOutput<typeof ResponseSchema>> {
  let response;
  try {
    response = await fetch(`${baseUrl}/gpts/${args.sessionId}/infer`, {
      method: "POST",
      headers: {
        Authorization: `Token ${env.INFERENCE_NODE_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: args.prompt,
        nEval: args.nEval,
        options: args.options,
      }),
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

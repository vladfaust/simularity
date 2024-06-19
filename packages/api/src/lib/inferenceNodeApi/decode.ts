import { env } from "@/env.js";
import { toMilliseconds } from "duration-fns";
import { FetchError, ResponseOkError } from "../errors.js";
import { abortSignal } from "../utils.js";
import { v } from "../valibot.js";

const ResponseSchema = v.object({
  /**
   * Decoding duration in milliseconds.
   */
  duration: v.number(),

  /**
   * New KV cache size.
   */
  kvCacheSize: v.number(),

  /**
   * Session dump size in bytes, if dumped.
   */
  sessionDumpSize: v.nullable(v.number()),
});

export async function decode(
  baseUrl: string,
  sessionId: string,
  args: {
    prompt: string;
    dumpSession: boolean;
  },
  options: { timeout: number } = {
    timeout: toMilliseconds({ minutes: 2 }),
  },
): Promise<v.InferOutput<typeof ResponseSchema>> {
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

  return await response.json().then((x) => v.parse(ResponseSchema, x));
}

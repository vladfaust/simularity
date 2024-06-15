import { env } from "@/env.js";
import { FetchError, ResponseOkError } from "../errors.js";
import { v } from "../valibot.js";

const ResponseSchema = v.object({
  /**
   * New KV cache size.
   */
  kvCacheSize: v.number(),
});

export async function commit(
  baseUrl: string,
  args: { sessionId: string },
): Promise<v.InferOutput<typeof ResponseSchema>> {
  let response;
  try {
    response = await fetch(`${baseUrl}/gpts/${args.sessionId}/commit`, {
      method: "POST",
      headers: {
        Authorization: `Token ${env.INFERENCE_NODE_SECRET}`,
      },
    });
  } catch (e: any) {
    throw new FetchError(e.message);
  }

  if (!response.ok) {
    throw await ResponseOkError.from(response);
  }

  return await response.json().then((x) => v.parse(ResponseSchema, x));
}

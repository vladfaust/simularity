import { env } from "@/env.js";
import { FetchError, ResponseOkError } from "../errors.js";
import { v } from "../valibot.js";

const ResponseSchema = v.object({
  tokenCount: v.number(),
});

export async function tokenCount(
  baseUrl: string,
  args: { prompt: string },
): Promise<v.InferOutput<typeof ResponseSchema>> {
  let response;
  try {
    response = await fetch(`${baseUrl}/gpts/token-count`, {
      method: "POST",
      headers: {
        Authorization: `Token ${env.INFERENCE_NODE_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
  } catch (e: any) {
    throw new FetchError(e.message);
  }

  if (!response.ok) {
    throw await ResponseOkError.from(response);
  }

  return await response.json().then((x) => v.parse(ResponseSchema, x));
}

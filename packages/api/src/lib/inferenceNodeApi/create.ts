import { env } from "@/env.js";
import { FetchError, ResponseOkError } from "../errors.js";
import { v } from "../valibot.js";

const ResponseSchema = v.object({
  /**
   * Whether was the session loaded, if initial prompt is set.
   * False means a session file was not found.
   */
  sessionLoaded: v.nullable(v.boolean()),
});

export async function create(
  baseUrl: string,
  args: {
    id: string;
    initialPrompt: string | undefined;
  },
): Promise<v.InferOutput<typeof ResponseSchema>> {
  let response;
  try {
    response = await fetch(`${baseUrl}/gpts`, {
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

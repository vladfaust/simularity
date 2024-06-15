import { env } from "@/env.js";
import { FetchError, ResponseOkError } from "../errors.js";

export async function create(
  baseUrl: string,
  args: { id: string },
): Promise<void> {
  let response;
  try {
    response = await fetch(`${baseUrl}/gpts`, {
      method: "POST",
      headers: {
        Authorization: `Token ${env.INFERENCE_NODE_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: args.id,
      }),
    });
  } catch (e: any) {
    throw new FetchError(e.message);
  }

  if (!response.ok) {
    throw await ResponseOkError.from(response);
  }

  return;
}

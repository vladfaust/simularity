import { env } from "@/env.js";
import { FetchError, ResponseOkError } from "../errors.js";

export async function destroy(
  baseUrl: string,
  sessionId: number,
): Promise<void> {
  let response;
  try {
    response = await fetch(`${baseUrl}/gpts/${sessionId}`, {
      method: "DELETE",
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

  return;
}

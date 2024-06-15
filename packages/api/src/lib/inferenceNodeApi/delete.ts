import { env } from "@/env.js";
import { FetchError, ResponseOkError } from "../errors.js";

export async function delete_(
  baseUrl: string,
  args: { sessionId: string },
): Promise<void> {
  let response;
  try {
    response = await fetch(`${baseUrl}/gpts/${args.sessionId}`, {
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

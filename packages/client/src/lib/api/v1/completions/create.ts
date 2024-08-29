import { RemoteApiError } from "@/lib/api";
import { v } from "@/lib/valibot";
import * as createCompletionApi from "@simularity/api-sdk/v1/completions/create";

export async function create(
  baseUrl: string,
  jwt: string,
  sessionId: string | undefined,
  body: v.InferOutput<typeof createCompletionApi.RequestBodySchema>,
  signal?: AbortSignal,
) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json",
  };

  if (sessionId) {
    headers["x-session-id"] = sessionId;
  }

  const response = await fetch(`${baseUrl}/v1/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw new RemoteApiError(
      response,
      `Failed to create completion: ${response.status} ${await response.text()}`,
    );
  }

  const parseResult = v.safeParse(
    createCompletionApi.ResponseSchema,
    await response.json(),
  );

  if (!parseResult.success) {
    throw new RemoteApiError(
      response,
      `Failed to parse completion response: ${v.flatten(parseResult.issues)}`,
    );
  }

  return parseResult.output;
}

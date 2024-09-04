import { PaymentRequiredError, RemoteApiError } from "@/lib/api";
import { v } from "@/lib/valibot";
import * as createCompletionApi from "@simularity/api-sdk/v1/completions/create";
import * as tauriHttp from "@tauri-apps/api/http";
import { toMilliseconds } from "duration-fns";

/**
 * Create an LLM completion.
 */
// ADHOC: Tauri fetch client implementation ignores signals.
export async function create(
  baseUrl: string,
  jwt: string,
  sessionId: string | undefined,
  body: v.InferOutput<typeof createCompletionApi.RequestBodySchema>,
  _signal?: AbortSignal,
) {
  const url = `${baseUrl}/v1/completions`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json",
  };

  if (sessionId) {
    headers["x-session-id"] = sessionId;
  }

  const client = await tauriHttp.getClient({
    connectTimeout: toMilliseconds({ minutes: 5 }),
  });

  const response = await client.post(url, tauriHttp.Body.json(body), {
    headers,
    responseType: tauriHttp.ResponseType.JSON,
  });

  if (!response.ok) {
    if (response.status === 402) {
      throw new PaymentRequiredError();
    } else {
      throw new RemoteApiError(
        response,
        `POST ${url} request failed: ${response.status} ${JSON.stringify(response.data)}`,
      );
    }
  }

  const parseResult = v.safeParse(
    createCompletionApi.ResponseSchema,
    response.data,
  );

  if (!parseResult.success) {
    throw new RemoteApiError(
      response,
      `POST ${url} parse failed: ${JSON.stringify(v.flatten(parseResult.issues))}`,
    );
  }

  return parseResult.output;
}

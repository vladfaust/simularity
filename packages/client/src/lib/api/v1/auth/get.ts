import { RemoteApiError } from "@/lib/api";
import { v } from "@/lib/valibot";
import * as apiAuthGet from "@simularity/api-sdk/v1/auth/nonce/get";

export async function get(baseUrl: string, nonce: string) {
  const url = new URL(`${baseUrl}/v1/auth/nonce/${nonce}`);
  const response = await fetch(url);

  if (!response.ok) {
    throw new RemoteApiError(
      response,
      `GET ${url}: ${response.status} ${await response.text()}`,
    );
  }

  const parseResult = v.safeParse(
    apiAuthGet.ResponseSchema,
    await response.json(),
  );

  if (!parseResult.success) {
    throw new RemoteApiError(
      response,
      `Failed to parse GET ${url} response: ${v.flatten(parseResult.issues)}`,
    );
  }

  return parseResult.output;
}

import { RemoteApiError } from "@/lib/api";
import { v } from "@/lib/valibot";
import * as getUserApi from "@simularity/api-sdk/v1/users/get";

export async function get(baseUrl: string, jwt: string) {
  const response = await fetch(`${baseUrl}/v1/users`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
  });

  if (!response.ok) {
    throw new RemoteApiError(
      `/v1/users: ${response.status} ${await response.text()}`,
    );
  }

  const parseResult = v.safeParse(
    getUserApi.ResponseSchema,
    await response.json(),
  );

  if (!parseResult.success) {
    throw new RemoteApiError(
      `Failed to parse /v1/users response: ${v.flatten(parseResult.issues)}`,
    );
  }

  return parseResult.output;
}

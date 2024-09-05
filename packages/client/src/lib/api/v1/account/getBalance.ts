import { RemoteApiError } from "@/lib/api";
import { v } from "@/lib/valibot";
import { ResponseSchema } from "@simularity/api-sdk/v1/account/balance";

export async function getBalance(baseUrl: string, jwt: string) {
  const url = `${baseUrl}/v1/account/balance`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
  });

  if (!response.ok) {
    throw new RemoteApiError(
      response,
      `GET ${url}: ${response.status} ${await response.text()}`,
    );
  }

  return response.json().then((json) => v.parse(ResponseSchema, json));
}

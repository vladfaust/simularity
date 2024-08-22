import { RemoteApiError } from "@/lib/api";
import { v } from "@/lib/valibot";
import * as modelIndexApi from "@simularity/api-sdk/v1/models/index";

export async function index(baseUrl: string, jwt?: string) {
  const response = await fetch(`${baseUrl}/v1/models`, {
    headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
  });

  if (!response.ok) {
    throw new RemoteApiError(
      `Failed to fetch models: ${response.status} ${await response.text()}`,
    );
  }

  const parseResult = v.safeParse(
    modelIndexApi.ResponseSchema,
    await response.json(),
  );

  if (!parseResult.success) {
    throw new RemoteApiError(
      `Failed to parse models response: ${JSON.stringify(v.flatten(parseResult.issues))}`,
    );
  }

  return parseResult.output;
}

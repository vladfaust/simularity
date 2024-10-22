import { env } from "@/env";
import { RestError } from "@/lib/api/rest";
import { v } from "@/lib/valibot";
import { ReleaseSchema } from "@simularity/api/lib/schema";

export async function latestRelease() {
  const url = `${env.VITE_API_BASE_URL}/rest/v1/releases/latest.json`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new RestError(
      response,
      `GET ${url}: ${response.status} ${await response.text()}`,
    );
  }

  return response.json().then((json) => v.parse(ReleaseSchema, json));
}

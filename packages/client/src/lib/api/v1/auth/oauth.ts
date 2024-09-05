import { RemoteApiError } from "@/lib/api";

export type ProviderId = "patreon";

export async function create(providerId: ProviderId, reason: "link") {
  const url = `${import.meta.env.VITE_API_BASE_URL}/v1/auth/oauth`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ providerId, reason }),
  });

  if (!response.ok) {
    throw new RemoteApiError(response, await response.text());
  }

  return response.json() as Promise<{
    url: string;
    state: string;
  }>;
}

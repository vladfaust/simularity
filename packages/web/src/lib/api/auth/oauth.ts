import { ApiError } from "@/lib/api";

export type ProviderId = "patreon";

export async function create(
  providerId: "patreon",
  reason: "login" | "link",
  returnUrl?: string,
) {
  const url = `${import.meta.env.VITE_API_BASE_URL}/v1/auth/oauth`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ providerId, reason, returnUrl }),
  });

  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }

  return response.json() as Promise<{
    url: string;
    state: string;
  }>;
}

export async function callback(
  code: string,
  state: string,
  reason: "login" | "link",
) {
  const url = `${import.meta.env.VITE_API_BASE_URL}/v1/auth/oauth/callback`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code, state, reason }),
  });

  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }

  return response.json() as Promise<{
    jwt: string;
    returnUrl?: string;
  }>;
}

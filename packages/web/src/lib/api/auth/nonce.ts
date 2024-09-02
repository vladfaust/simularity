import { ApiError } from "@/lib/api";
import { jwt } from "@/store";

/**
 * Authorize a nonce, so it can be queried for a JWT.
 */
export async function authorize(nonce: string): Promise<void> {
  if (!jwt.value) throw new Error("BUG: Not logged in");

  const response = await fetch(
    import.meta.env.VITE_API_BASE_URL + "/v1/auth/nonce/" + nonce,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + jwt.value,
      },
    },
  );

  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }

  return;
}

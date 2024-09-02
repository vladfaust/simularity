import { ApiError } from "../../api";

/**
 * Send a login code to an email address.
 */
export async function sendCode(email: string, nonce?: string) {
  const response = await fetch(
    import.meta.env.VITE_API_BASE_URL + "/v1/auth/email",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        nonce,
      }),
    },
  );

  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }

  return;
}

/**
 * Log in with an email address and code.
 */
export async function loginWithCode(email: string, code: string) {
  const response = await fetch(
    import.meta.env.VITE_API_BASE_URL +
      "/v1/auth/email/" +
      email +
      "?code=" +
      code,
  );

  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }

  return (await response.json()) as {
    jwt: string;
    justCreated: boolean;
  };
}

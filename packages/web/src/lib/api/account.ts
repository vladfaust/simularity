import { jwt } from "@/store";
import { ApiError } from "../api";
import { ResponseSchema as AccountResponseSchema } from "@simularity/api-sdk/v1/account";
import { ResponseSchema as AccountBalanceResponseSchema } from "@simularity/api-sdk/v1/account/balance";
import { v } from "../valibot";

/**
 * Get the logged-in user.
 */
export async function get() {
  if (!jwt.value) throw new Error("BUG: Not logged in");

  const response = await fetch(
    import.meta.env.VITE_API_BASE_URL + "/v1/account",
    {
      headers: {
        Authorization: "Bearer " + jwt.value,
      },
    },
  );

  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }

  return response.json().then((json) => v.parse(AccountResponseSchema, json));
}

/**
 * Get the balance of logged-in user.
 */
export async function getBalance() {
  if (!jwt.value) throw new Error("BUG: Not logged in");

  const response = await fetch(
    import.meta.env.VITE_API_BASE_URL + "/v1/account/balance",
    {
      headers: {
        Authorization: "Bearer " + jwt.value,
      },
    },
  );

  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }

  return response
    .json()
    .then((json) => v.parse(AccountBalanceResponseSchema, json));
}

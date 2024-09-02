import { jwt } from "@/store";
import { ApiError } from "../api";

/**
 * Get the logged-in user.
 */
export async function get() {
  if (!jwt.value) throw new Error("BUG: Not logged in");

  const response = await fetch(
    import.meta.env.VITE_API_BASE_URL + "/v1/users",
    {
      headers: {
        Authorization: "Bearer " + jwt.value,
      },
    },
  );

  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }

  return (await response.json()) as {
    email: string;
  };
}

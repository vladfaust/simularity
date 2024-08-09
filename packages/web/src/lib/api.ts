import { jwt } from "@/store";

class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
  ) {
    super(message);
  }
}

export async function createUser(username: string, password: string) {
  const response = await fetch(
    import.meta.env.VITE_API_BASE_URL + "/v1/users",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username,
        password,
      }),
    },
  );

  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }

  return (await response.json()) as { jwt: string };
}

export async function createAuth(username: string, password: string) {
  const response = await fetch(import.meta.env.VITE_API_BASE_URL + "/v1/auth", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username,
      password,
    }),
  });

  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }

  return (await response.json()) as { jwt: string };
}

export async function getUser() {
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

  return (await response.json()) as { id: string; username: string };
}

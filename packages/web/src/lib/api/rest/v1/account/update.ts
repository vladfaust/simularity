import { env } from "@/env";
import { RestError } from "@/lib/api/rest";

export async function update(data: FormData) {
  const url = `${env.VITE_API_BASE_URL}/rest/v1/account`;

  const response = await fetch(url, {
    method: "PUT",
    body: data,
    credentials: "include",
  });

  if (!response.ok) {
    throw new RestError(
      response,
      `PUT ${url}: ${response.status} ${await response.text()}`,
    );
  }
}

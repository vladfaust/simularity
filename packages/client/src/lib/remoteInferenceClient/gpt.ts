export { create } from "./gpt/create";
export { decode } from "./gpt/decode";
export { infer } from "./gpt/infer";

/**
 * Return whether a GPT session exists.
 */
export async function find(baseUrl: string, gptId: string): Promise<boolean> {
  const response = await fetch(`${baseUrl}/gpts/${gptId}`, {
    method: "HEAD",
  });

  if (!response.ok) {
    return false;
  }

  return true;
}

export async function commit(
  baseUrl: string,
  gptId: string,
): Promise<{ commitId: string; kvCacheSize: number }> {
  const response = await fetch(`${baseUrl}/gpts/${gptId}/commit`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Failed to commit: ${response.statusText}`);
  }

  return (await response.json()) as { commitId: string; kvCacheSize: number };
}

/**
 * Reset the GPT session to its initial state (i.e. static prompt).
 */
export async function reset(
  baseUrl: string,
  gptId: string,
): Promise<{ resetId: string }> {
  const response = await fetch(`${baseUrl}/gpts/${gptId}/reset`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Failed to reset: ${response.statusText}`);
  }

  return (await response.json()) as { resetId: string };
}

export async function destroy(baseUrl: string, gptId: string): Promise<void> {
  const response = await fetch(`${baseUrl}/gpts/${gptId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`Failed to destroy GPT session: ${response.statusText}`);
  }
}

export async function tokenCount(
  baseUrl: string,
  model: string,
  prompt: string,
): Promise<number> {
  const response = await fetch(`${baseUrl}/gpts/token-count`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get token count: ${response.statusText}`);
  }

  return ((await response.json()) as { count: number }).count;
}

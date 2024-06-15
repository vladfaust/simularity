import { InferOptions } from "../ai";

export async function create(
  baseUrl: string,
  model: string,
): Promise<{ id: string }> {
  const response = await fetch(`${baseUrl}/gpts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create GPT session: ${response.statusText}`);
  }

  return (await response.json()) as { id: string };
}

export async function decode(
  baseUrl: string,
  gptSessionId: string,
  prompt: string,
): Promise<{
  decodingId: string;
  kvCacheSize: number;
}> {
  const response = await fetch(`${baseUrl}/gpts/${gptSessionId}/decode`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    throw new Error(`Failed to decode prompt: ${response.statusText}`);
  }

  return (await response.json()) as {
    decodingId: string;
    kvCacheSize: number;
  };
}

export async function infer(
  baseUrl: string,
  gptSessionId: string,
  prompt: string | undefined,
  nEval: number,
  options: InferOptions,
): Promise<{
  inferenceId: string;
  result: string;
  kvCacheSize: number;
}> {
  const response = await fetch(`${baseUrl}/gpts/${gptSessionId}/infer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt, nEval, options }),
  });

  if (!response.ok) {
    throw new Error(`Failed to infer: ${response.statusText}`);
  }

  return (await response.json()) as {
    inferenceId: string;
    result: string;
    kvCacheSize: number;
  };
}

export async function commit(
  baseUrl: string,
  gptSessionId: string,
): Promise<{ commitId: string; kvCacheSize: number }> {
  const response = await fetch(`${baseUrl}/gpts/${gptSessionId}/commit`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Failed to commit: ${response.statusText}`);
  }

  return (await response.json()) as { commitId: string; kvCacheSize: number };
}

export async function delete_(
  baseUrl: string,
  gptSessionId: string,
): Promise<void> {
  const response = await fetch(`${baseUrl}/gpts/${gptSessionId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`Failed to delete GPT session: ${response.statusText}`);
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

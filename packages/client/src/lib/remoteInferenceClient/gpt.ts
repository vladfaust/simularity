import { InferenceOptions } from "../ai";
import { abortSignal } from "../utils";

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

export async function create(
  baseUrl: string,
  body: {
    model: string;
    initialPrompt?: string;
  },
): Promise<{ id: string; sessionLoaded?: boolean }> {
  const response = await fetch(`${baseUrl}/gpts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Failed to create GPT session: ${response.statusText}`);
  }

  return (await response.json()) as { id: string; sessionLoaded: boolean };
}

export async function decode(
  baseUrl: string,
  gptId: string,
  body: {
    prompt: string;
    dumpSession: boolean;
  },
  options: { timeout: number },
): Promise<{
  decodingId: string;
  kvCacheSize: number;
  sessionDumpSize?: number;
}> {
  const response = await fetch(`${baseUrl}/gpts/${gptId}/decode`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: abortSignal(options.timeout),
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
  gptId: string,
  body: {
    prompt: string | null;
    nEval: number;
    options: InferenceOptions;
  },
  options: { timeout: number },
): Promise<{
  inferenceId: string;
  result: string;
  kvCacheSize: number;
}> {
  const response = await fetch(`${baseUrl}/gpts/${gptId}/infer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: abortSignal(options.timeout),
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

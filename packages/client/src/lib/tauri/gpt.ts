import { invoke } from "@tauri-apps/api";
import { InferOptions } from "../ai";

/**
 * Load a GPT model from a file path.
 */
export async function gptLoadModel(modelPath: string) {
  return (await invoke("gpt_load_model", {
    modelPath,
  })) as {
    trainContextSize: number;
  };
}

/**
 * Find or create a new GPT instance by ID.
 * NOTE: Changing any parameter will replace the instance.
 * @returns The instance's context cache key.
 */
export async function gptFindOrCreate(
  gptId: string,
  modelPath: string,
  contextSize: number,
  batchSize: number,
): Promise<string> {
  return await invoke("gpt_find_or_create", {
    gptId,
    modelPath,
    contextSize,
    batchSize,
  });
}

/**
 * Reset the GPT context. Will clear the KV cache.
 */
export async function gptReset(gptId: string): Promise<void> {
  return await invoke("gpt_reset", { gptId });
}

/**
 * Decode prompt, updating the KV cache.
 */
export async function gptDecode(
  gptId: string,
  prompt: string,
  newKvCacheKey: string,
): Promise<void> {
  return await invoke("gpt_decode", {
    gptId,
    prompt,
    newKvCacheKey,
  });
}

/**
 * Predict text. Does not update the KV cache.
 */
export async function gptInfer(
  gptId: string,
  prompt: string | undefined,
  numEval: number,
  options: InferOptions = {},
): Promise<string> {
  return await invoke("gpt_infer", {
    gptId,

    // NOTE: Only send the prompt if is truthy.
    prompt: prompt ? prompt : undefined,

    nEval: numEval,
    options,
  });
}
/**
 * Commit the latest inference result to the KV cache.
 * Returns the number of tokens committed.
 */
export async function gptCommit(
  gptId: string,
  newKvCacheKey: string,
): Promise<number> {
  return await invoke("gpt_commit", { gptId, newKvCacheKey });
}

/**
 * Tokenize prompt and return the token count.
 */
export async function gptTokenCount(
  modelPath: string,
  prompt: string,
): Promise<number> {
  return await invoke("gpt_token_count", { modelPath, prompt });
}

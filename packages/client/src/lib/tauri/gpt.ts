import { invoke } from "@tauri-apps/api";
export { create } from "./gpt/create";
export { decode } from "./gpt/decode";
export { infer } from "./gpt/infer";

/**
 * Load a GPT model from a file path.
 */
export async function loadModel(modelPath: string) {
  return (await invoke("gpt_load_model", {
    modelPath,
  })) as {
    trainContextSize: number;
  };
}

/**
 * Return whether a GPT instance exists.
 */
export async function find(gptId: string) {
  return (await invoke("gpt_find", { gptId })) as boolean;
}

/**
 * Destroy a GPT instance.
 */
export async function destroy(gptId: string): Promise<void> {
  return await invoke("gpt_destroy", { gptId });
}

/**
 * Commit the latest inference result to the KV cache.
 * Returns the number of tokens committed.
 */
// TODO: Return the new KV cache size.
export async function commit(gptId: string): Promise<number> {
  return await invoke("gpt_commit", { gptId });
}

/**
 * Tokenize prompt and return the token count.
 */
export async function tokenCount(
  modelPath: string,
  prompt: string,
): Promise<number> {
  return await invoke("gpt_token_count", { modelPath, prompt });
}

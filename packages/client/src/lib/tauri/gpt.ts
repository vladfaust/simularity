import { invoke } from "@tauri-apps/api";
import { InferenceOptions } from "../ai";

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
 * Create a new GPT instance.
 */
export async function create(
  gptId: string,
  modelPath: string,
  contextSize: number,
  batchSize: number,
  initialPrompt?: string,
) {
  return (await invoke("gpt_create", {
    gptId,
    modelPath,
    contextSize,
    batchSize,
    initialPrompt,
  })) as {
    sessionLoaded?: boolean;
  };
}

/**
 * Destroy a GPT instance.
 */
export async function destroy(gptId: string): Promise<void> {
  return await invoke("gpt_destroy", { gptId });
}

/**
 * Decode prompt, updating the KV cache.
 */
export async function decode(
  gptId: string,
  prompt: string,
  dumpSession: boolean,
): Promise<void> {
  return await invoke("gpt_decode", { gptId, prompt, dumpSession });
}

/**
 * Predict text. Does not update the KV cache.
 */
export async function infer(
  gptId: string,
  prompt: string | null,
  numEval: number,
  inferOptions: InferenceOptions = {},
): Promise<string> {
  return await invoke("gpt_infer", {
    gptId,

    // NOTE: Only send the prompt if is truthy.
    prompt: prompt ? prompt : undefined,

    nEval: numEval,
    options: inferOptions,
  });
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

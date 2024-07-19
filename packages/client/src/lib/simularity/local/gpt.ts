import { invoke } from "@tauri-apps/api";
export { create } from "./gpt/create";
export { decode } from "./gpt/decode";
export { infer } from "./gpt/infer";

/**
 * Load a GPT model from a file path.
 */
export async function loadModel(modelPath: string) {
  const result = (await invoke("gpt_load_model", {
    modelPath,
  })) as {
    modelId: string;
    trainContextSize: number;
  };

  // // ADHOC: Wait for the model to be loaded.
  // // Something something threads.
  // await sleep(100);

  return result;
}

/**
 * Return whether a GPT session exists.
 */
export async function find(sessionId: string) {
  return (await invoke("gpt_find", { sessionId })) as boolean;
}

/**
 * Destroy a GPT session.
 */
export async function destroy(sessionId: string): Promise<void> {
  return await invoke("gpt_destroy", { sessionId });
}

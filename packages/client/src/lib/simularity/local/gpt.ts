import { invoke } from "@tauri-apps/api";
export { create } from "./gpt/create";
export { decode } from "./gpt/decode";
export { infer } from "./gpt/infer";

export type LoadModelResult = {
  modelId: string;

  /**
   * The size of the model in bytes.
   */
  size: number;

  /**
   * The number of parameters in the model.
   */
  nParams: number;

  /**
   * Size of the context window the model was trained on.
   */
  nCtxTrain: number;
};

/**
 * Load a GPT model from a file path.
 */
export async function loadModel(modelPath: string) {
  return invoke("gpt_load_model", {
    modelPath,
  }) as Promise<LoadModelResult>;
}

export type ModelHashResult = {
  xx64Hash: string;
};

/**
 * Compute the hash of a GPT model.
 */
export async function modelHash(modelId: string) {
  return invoke("gpt_model_hash", { modelId }) as Promise<ModelHashResult>;
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

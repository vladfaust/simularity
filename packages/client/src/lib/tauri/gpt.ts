import { invoke } from "@tauri-apps/api";
export { create } from "./gpt/create";
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
 * Can be called multiple times with the same model path.
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
 * Compute the hash of a GPT model by its ID (memoized).
 */
export async function getModelHashById(modelId: string) {
  return invoke("gpt_model_hash_by_id", {
    modelId,
  }) as Promise<ModelHashResult>;
}

/**
 * Compute the hash of a GPT model by its path.
 */
export async function getModelHashByPath(modelPath: string) {
  return invoke("gpt_model_hash_by_path", {
    modelPath,
  }) as Promise<ModelHashResult>;
}

/**
 * Find a GPT session, and return its model ID if found.
 */
export async function find(sessionId: string) {
  return (await invoke("gpt_find", { sessionId })) as {
    modelId: string;
  } | null;
}

/**
 * Destroy a GPT session.
 */
export async function destroy(sessionId: string): Promise<void> {
  return await invoke("gpt_destroy", { sessionId });
}

import { invoke } from "@tauri-apps/api";
import { listen } from "@tauri-apps/api/event";
import { InferenceOptionsSchema } from "../ai/common";
import { v } from "../valibot";

export type InferenceEventPayload = {
  content: string;
};

const INFERENCE_EVENT_NAME = "app://gpt/inference";

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
  inferOptions: v.InferInput<typeof InferenceOptionsSchema> = {},
  callback?: (event: InferenceEventPayload) => void,
): Promise<string> {
  const unlisten = callback
    ? await listen(INFERENCE_EVENT_NAME, (event) => {
        callback(event.payload as InferenceEventPayload);
      })
    : undefined;

  const result = (await invoke("gpt_infer", {
    gptId,

    // NOTE: Only send the prompt if is truthy.
    prompt: prompt ? prompt : undefined,

    nEval: numEval,
    options: inferOptions,
    eventName: callback ? INFERENCE_EVENT_NAME : undefined,
  })) as string;

  unlisten?.();

  return result;
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

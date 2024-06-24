import { InferenceOptionsSchema } from "@/lib/ai/common";
import { v } from "@/lib/valibot";
import { invoke } from "@tauri-apps/api";
import { listen } from "@tauri-apps/api/event";

type Response = string;

type DecodingProgress = {
  progress: number;
};

type InferenceContent = {
  content: string;
};

const COMMAND_NAME = "gpt_infer";
const INFERENCE_EVENT_NAME = "app://gpt/inference";
const DECODING_EVENT_NAME = "app://gpt/decoding";

/**
 * Predict text. Does not update the KV cache.
 */
export async function infer(
  gptId: string,
  prompt: string | null,
  numEval: number,
  inferOptions: v.InferInput<typeof InferenceOptionsSchema> = {},
  decodeCallback?: (event: DecodingProgress) => void,
  inferenceCallback?: (event: InferenceContent) => void,
): Promise<Response> {
  const unlistenDecode = decodeCallback
    ? await listen(DECODING_EVENT_NAME, (event) => {
        decodeCallback(event.payload as DecodingProgress);
      })
    : undefined;

  const unlistenInference = inferenceCallback
    ? await listen(INFERENCE_EVENT_NAME, (event) => {
        inferenceCallback(event.payload as InferenceContent);
      })
    : undefined;

  const result = (await invoke(COMMAND_NAME, {
    gptId,

    // NOTE: Only send the prompt if it is truthy.
    prompt: prompt ? prompt : undefined,

    nEval: numEval,
    options: inferOptions,
    decodeCallbackEventName: decodeCallback ? DECODING_EVENT_NAME : undefined,
    inferenceCallbackEventName: inferenceCallback
      ? INFERENCE_EVENT_NAME
      : undefined,
  })) as Response;

  unlistenDecode?.();
  unlistenInference?.();

  return result;
}

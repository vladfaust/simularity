import { v } from "@/lib/valibot";
import { invoke } from "@tauri-apps/api";
import { emit, listen } from "@tauri-apps/api/event";
import { InferenceOptionsSchema } from "../../common";

type Response = {
  result: string;
  contextLength: number;
};

type DecodeProgressEventPayload = {
  progress: number;
};

type InferenceEventPayload = {
  content: string;
};

const COMMAND_NAME = "gpt_infer";
const INFERENCE_EVENT_NAME = "app://gpt/inference";
const DECODING_EVENT_NAME = "app://gpt/decoding";
const ABORT_INFERENCE_EVENT_NAME = "app://gpt/abort-inference";

/**
 * Predict the next token(s) given a prompt.
 */
export async function infer(
  sessionId: string,
  prompt: string | null,
  numEval: number,
  inferOptions: v.InferInput<typeof InferenceOptionsSchema> = {},
  decodeCallback?: (event: DecodeProgressEventPayload) => void,
  inferenceCallback?: (event: InferenceEventPayload) => void,
  abortSignal?: AbortSignal,
): Promise<Response> {
  const unlistenDecode = decodeCallback
    ? await listen(DECODING_EVENT_NAME, (event) => {
        decodeCallback(event.payload as DecodeProgressEventPayload);
      })
    : undefined;

  const unlistenInference = inferenceCallback
    ? await listen(INFERENCE_EVENT_NAME, (event) => {
        inferenceCallback(event.payload as InferenceEventPayload);
      })
    : undefined;

  if (abortSignal) {
    abortSignal.addEventListener("abort", () => {
      console.log("Aborting inference");
      emit(ABORT_INFERENCE_EVENT_NAME, sessionId).then(() => {
        console.log(
          `Sent ${ABORT_INFERENCE_EVENT_NAME} event to ${sessionId}.`,
        );
      });
    });
  }

  const result = (await invoke(COMMAND_NAME, {
    sessionId,

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

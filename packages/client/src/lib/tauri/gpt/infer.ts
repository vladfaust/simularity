import { TauriInvokeError } from "@/lib/tauri";
import { v } from "@/lib/valibot";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";

type Response = {
  result: string;
  inputContextLength: number;
  outputContextLength: number;
};

type DecodeProgressEventPayload = {
  progress: number;
};

type InferenceEventPayload = {
  content: string;
};

const CompletionOptionsSchema = v.strictObject({
  nPrev: v.optional(v.number()),
  nProbs: v.optional(v.number()),
  minKeep: v.optional(v.number()),
  topK: v.optional(v.number()),
  topP: v.optional(v.number()),
  minP: v.optional(v.number()),
  tfsZ: v.optional(v.number()),
  typicalP: v.optional(v.number()),
  temp: v.optional(v.number()),
  dynatemp: v.optional(
    v.object({
      range: v.optional(v.number()),
      exponent: v.optional(v.number()),
    }),
  ),
  penalty: v.optional(
    v.object({
      lastN: v.optional(v.number()),
      repeat: v.optional(v.number()),
      freq: v.optional(v.number()),
      present: v.optional(v.number()),
      penalizeNl: v.optional(v.boolean()),
    }),
  ),
  mirostat: v.optional(
    v.object({
      version: v.picklist(["v1", "v2"]),
      tau: v.optional(v.number()),
      eta: v.optional(v.number()),
    }),
  ),
  seed: v.optional(v.number()),
  grammar: v.optional(v.string()),
  luaGrammar: v.optional(v.string()),
});

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
  inferOptions: v.InferInput<typeof CompletionOptionsSchema> = {},
  decodeCallback?: (event: DecodeProgressEventPayload) => void,
  inferenceCallback?: (event: InferenceEventPayload) => void,
  abortSignal?: AbortSignal,
): Promise<Response> {
  const decodeCallbackEventName = decodeCallback
    ? `${DECODING_EVENT_NAME}/${sessionId}`
    : undefined;

  const inferenceCallbackEventName = inferenceCallback
    ? `${INFERENCE_EVENT_NAME}/${sessionId}`
    : undefined;

  const unlistenDecode = decodeCallback
    ? await listen(decodeCallbackEventName!, (event) => {
        decodeCallback(event.payload as DecodeProgressEventPayload);
      })
    : undefined;

  const unlistenInference = inferenceCallback
    ? await listen(inferenceCallbackEventName!, (event) => {
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

  try {
    return (await invoke(COMMAND_NAME, {
      sessionId,

      // NOTE: Only send the prompt if it is truthy.
      prompt: prompt ? prompt : undefined,

      nEval: numEval,
      options: inferOptions,
      decodeCallbackEventName,
      inferenceCallbackEventName,
    })) as Response;
  } catch (e: any) {
    throw new TauriInvokeError(e);
  } finally {
    unlistenDecode?.();
    unlistenInference?.();
  }
}

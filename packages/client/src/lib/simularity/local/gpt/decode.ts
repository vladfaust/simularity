import { invoke } from "@tauri-apps/api";
import { listen } from "@tauri-apps/api/event";

type Response = {
  duration: number;
  contextLength: number;
};

type ProgressEventPayload = {
  progress: number;
};

const COMMAND_NAME = "gpt_decode";
const DECODING_EVENT_NAME = "app://gpt/decoding";

/**
 * Decode prompt, updating the KV cache.
 */
export async function decode(
  sessionId: string,
  prompt: string,
  decodeCallback?: (event: ProgressEventPayload) => void,
): Promise<Response> {
  const unlisten = decodeCallback
    ? await listen(DECODING_EVENT_NAME, (event) => {
        decodeCallback(event.payload as ProgressEventPayload);
      })
    : undefined;

  const result = (await invoke(COMMAND_NAME, {
    sessionId,
    prompt,
    callbackEventName: decodeCallback ? DECODING_EVENT_NAME : undefined,
  })) as Response;

  unlisten?.();
  return result;
}

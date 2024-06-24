import { invoke } from "@tauri-apps/api";
import { listen } from "@tauri-apps/api/event";

type Response = {
  duration: number;
  kvCacheSize: number;
};

type Progress = {
  progress: number;
};

const COMMAND_NAME = "gpt_decode";
const DECODING_EVENT_NAME = "app://gpt/decoding";

/**
 * Decode prompt, updating the KV cache.
 */
export async function decode(
  gptId: string,
  prompt: string,
  decodeCallback?: (event: Progress) => void,
): Promise<Response> {
  const unlisten = decodeCallback
    ? await listen(DECODING_EVENT_NAME, (event) => {
        decodeCallback(event.payload as Progress);
      })
    : undefined;

  const result = (await invoke(COMMAND_NAME, {
    gptId,
    prompt,
    callbackEventName: decodeCallback ? DECODING_EVENT_NAME : undefined,
  })) as Response;

  unlisten?.();
  return result;
}

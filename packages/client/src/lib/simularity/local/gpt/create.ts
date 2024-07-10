import { invoke } from "@tauri-apps/api";
import { listen } from "@tauri-apps/api/event";

type Response = {
  sessionId: string;
  sessionLoaded?: boolean;
  sessionDumpSize?: number;
  contextLength: number;
};

type ProgressEventPayload = {
  progress: number;
};

const COMMAND_NAME = "gpt_create";
const PROGRESS_EVENT_NAME = "app://gpt/progress";

/**
 * Create a new GPT instance.
 */
export async function create(
  modelId: string,
  contextSize: number,
  initialPrompt?: string,
  progressCallback?: (event: ProgressEventPayload) => void,
  dumpSession?: boolean,
): Promise<Response> {
  const unlisten = progressCallback
    ? await listen(PROGRESS_EVENT_NAME, (event) => {
        progressCallback(event.payload as ProgressEventPayload);
      })
    : undefined;

  const result = (await invoke(COMMAND_NAME, {
    modelId,
    contextSize,
    initialPrompt,
    progressEventName: progressCallback ? PROGRESS_EVENT_NAME : undefined,
    dumpSession,
  })) as Response;

  unlisten?.();
  return result;
}

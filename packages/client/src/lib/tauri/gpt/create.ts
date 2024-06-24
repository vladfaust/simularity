import { invoke } from "@tauri-apps/api";
import { listen } from "@tauri-apps/api/event";

type Response = {
  sessionLoaded?: boolean;
  sessionDumpSize?: number;
  contextLength: number;
};

type Progress = {
  progress: number;
};

const COMMAND_NAME = "gpt_create";
const PROGRESS_EVENT_NAME = "app://gpt/progress";

/**
 * Create a new GPT instance.
 */
export async function create(
  gptId: string,
  modelPath: string,
  contextSize: number,
  batchSize: number,
  initialPrompt?: string,
  progressCallback?: (event: Progress) => void,
  dumpSession?: boolean,
): Promise<Response> {
  const unlisten = progressCallback
    ? await listen(PROGRESS_EVENT_NAME, (event) => {
        progressCallback(event.payload as Progress);
      })
    : undefined;

  const result = (await invoke(COMMAND_NAME, {
    gptId,
    modelPath,
    contextSize,
    batchSize,
    initialPrompt,
    progressEventName: progressCallback ? PROGRESS_EVENT_NAME : undefined,
    dumpSession,
  })) as Response;

  unlisten?.();
  return result;
}

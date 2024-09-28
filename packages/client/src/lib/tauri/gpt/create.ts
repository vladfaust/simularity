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
 * May take time to decode the initial prompt.
 */
export async function create(args: {
  modelId: string;
  contextSize: number;
  batchSize?: number;
  initialPrompt?: string;
  progressCallback?: (event: ProgressEventPayload) => void;
  dumpSession?: boolean;
}): Promise<Response> {
  const unlisten = args.progressCallback
    ? await listen(PROGRESS_EVENT_NAME, (event) => {
        args.progressCallback!(event.payload as ProgressEventPayload);
      })
    : undefined;

  const result = (await invoke(COMMAND_NAME, {
    modelId: args.modelId,
    contextSize: args.contextSize,
    batchSize: args.batchSize,
    initialPrompt: args.initialPrompt,
    progressEventName: args.progressCallback ? PROGRESS_EVENT_NAME : undefined,
    dumpSession: args.dumpSession,
  })) as Response;

  unlisten?.();
  return result;
}

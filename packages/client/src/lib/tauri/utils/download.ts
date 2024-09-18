import { TauriInvokeError } from "@/lib/tauri";
import { v } from "@/lib/valibot";
import { invoke } from "@tauri-apps/api";
import { emit, listen } from "@tauri-apps/api/event";
import { nanoid } from "nanoid";

const COMMAND_NAME = "file_download";
const PROGRESS_EVENT_NAME = "app://downloads/progress";
const ABORT_EVENT_NAME = "app://downloads/abort";

const ProgressEventPayloadSchema = v.object({
  /**
   * Number of bytes downloaded since the last progress event.
   */
  downloadedBytes: v.number(),

  /**
   * Elapsed time in milliseconds since the last progress event.
   * Speed can be calculated as `downloadedBytes / elapsedTime`.
   */
  elapsedTime: v.number(),

  /**
   * Total number of bytes downloaded so far.
   */
  currentFileSize: v.number(),

  /**
   * Total number of bytes to download.
   */
  targetContentLength: v.number(),
});

type ProgressEventPayload = v.InferOutput<typeof ProgressEventPayloadSchema>;

const ResponseSchema = v.object({
  /**
   * Whether the download was successful.
   */
  aborted: v.boolean(),

  /**
   * Total number of bytes downloaded so far.
   */
  currentFileSize: v.number(),

  /**
   * Total number of bytes to download.
   */
  targetContentLength: v.number(),
});

export type Response = v.InferOutput<typeof ResponseSchema>;

/**
 * Download a file from the specified URL to the specified path.
 */
export async function download(
  url: string,
  path: string,
  onProgress?: (event: ProgressEventPayload) => void,
  abortSignal?: AbortSignal,
): Promise<Response> {
  const sessionId = nanoid();

  const progressEventName = onProgress
    ? `${PROGRESS_EVENT_NAME}/${sessionId}`
    : undefined;

  const unlistenOnProgress = onProgress
    ? await listen(progressEventName!, (event) => {
        onProgress(v.parse(ProgressEventPayloadSchema, event.payload));
      })
    : undefined;

  let abortEventName = abortSignal
    ? `${ABORT_EVENT_NAME}/${sessionId}`
    : undefined;

  if (abortSignal) {
    abortSignal.addEventListener("abort", () => {
      console.log("Aborting download", { url, path, sessionId });

      emit(abortEventName!, sessionId).then(() => {
        console.log(`Sent ${ABORT_EVENT_NAME} event to ${sessionId}`);
      });
    });
  }

  try {
    const response = await invoke(COMMAND_NAME, {
      url,
      path,
      progressEventName,
      abortEventName,
    });

    return v.parse(ResponseSchema, response);
  } catch (e: any) {
    throw new TauriInvokeError(e);
  } finally {
    unlistenOnProgress?.();
  }
}

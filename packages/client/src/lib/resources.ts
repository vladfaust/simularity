export * as tts from "./resources/tts";
import * as dialog from "@tauri-apps/api/dialog";

export async function confirm_(
  message: string,
  options?: dialog.ConfirmDialogOptions,
) {
  if (window.__TAURI__) {
    return dialog.confirm(message, options);
  } else {
    return confirm(message);
  }
}

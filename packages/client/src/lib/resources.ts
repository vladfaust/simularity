export * as tts from "./resources/tts";
import * as dialog from "@tauri-apps/api/dialog";
import * as path from "@tauri-apps/api/path";

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

/**
 * Return the path to the scenarios directory.
 */
export async function scenariosDir() {
  return path.join(await path.appLocalDataDir(), "scenarios");
}

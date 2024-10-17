export * as tts from "./resources/tts";
import * as tauriPath from "@tauri-apps/api/path";
import * as tauriDialog from "@tauri-apps/plugin-dialog";

export async function confirm_(
  message: string,
  options?: tauriDialog.ConfirmDialogOptions,
) {
  return tauriDialog.confirm(message, options);
}

/**
 * Return the path to the scenarios directory.
 */
export async function scenariosDir() {
  return tauriPath.join(await tauriPath.appLocalDataDir(), "scenarios");
}

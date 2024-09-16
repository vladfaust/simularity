import { invoke } from "@tauri-apps/api";

/**
 * Open a file manager at the specified path.
 * Unlike [`shell.open`](https://tauri.app/v1/api/js/shell/#open),
 * this command allows to select a file.
 */
export async function fileManagerOpen(path: string): Promise<void> {
  await invoke("file_manager_open", { path });
}

/**
 * Calculates the SHA-256 hash of the given file.
 */
export async function fileSha256(path: string): Promise<string> {
  return await invoke("file_sha256", { path });
}

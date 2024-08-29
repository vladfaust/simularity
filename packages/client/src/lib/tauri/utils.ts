import { invoke } from "@tauri-apps/api";

/**
 * Open a file manager at the specified path.
 * Unlike [`shell.open`](https://tauri.app/v1/api/js/shell/#open),
 * this command allows to select a file.
 */
export async function fileManagerOpen(path: string): Promise<void> {
  await invoke("file_manager_open", { path });
}

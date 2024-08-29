import { invoke } from "@tauri-apps/api";

/**
 * Open a file manager at the specified path.
 */
export async function fileManagerOpen(path: string): Promise<void> {
  await invoke("file_manager_open", { path });
}

import { invoke } from "@tauri-apps/api/core";
export { download } from "./utils/download";

/**
 * Open a file manager at the specified path.
 * Unlike [`shell.open`](https://tauri.app/v1/api/js/shell/#open),
 * this command allows to select a file.
 */
export async function fileManagerOpen(path: string): Promise<void> {
  await invoke("file_manager_open", { path });
}

const SHA256_MEMO: Record<string, string> = {};

/**
 * Calculates the SHA-256 hash of the given file.
 * @param allowMemo - Whether to use a memoized value if available.
 */
export async function fileSha256(
  path: string,
  allowMemo = false,
): Promise<string> {
  if (allowMemo && SHA256_MEMO[path]) {
    return SHA256_MEMO[path];
  } else {
    const sha256 = (await invoke("file_sha256", { path })) as string;
    SHA256_MEMO[path] = sha256;
    return sha256;
  }
}

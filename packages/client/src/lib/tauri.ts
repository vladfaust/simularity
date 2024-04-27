import { invoke } from "@tauri-apps/api";

export async function gitInitRepository(
  repoPath: string,
  filePaths: string[],
): Promise<void> {
  await invoke("git_init_repository", {
    repoPath,
    filePaths,
  });
}

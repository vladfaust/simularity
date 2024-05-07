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

export async function gptPredict(
  prompt: string,
  nLen: number = 256,
): Promise<string> {
  return await invoke("gpt_predict", {
    modelPath: import.meta.env.VITE_MODEL_PATH,
    prompt,
    nLen,
  });
}

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

export async function gptInit(modelPath: string): Promise<string> {
  return await invoke("gpt_init", { modelPath });
}

export async function gptPredict(
  prompt: string,
  numEval: number,
  options: {
    stopSequences?: string[];
    temperature?: number;
  } = {},
): Promise<string> {
  return await invoke("gpt_predict", {
    prompt,
    nEval: numEval,
    stopSequences: options.stopSequences,
    temperature: options.temperature,
  });
}

import { invoke } from "@tauri-apps/api";

export async function gitInit(repoPath: string): Promise<void> {
  return invoke("git_init", { repoPath });
}

export async function gitHead(repoPath: string): Promise<string> {
  return invoke("git_head", { repoPath });
}

export async function gitAdd(
  repoPath: string,
  filePaths: string[],
): Promise<void> {
  return invoke("git_add", { repoPath, filePaths });
}

export async function gitCommit(
  repoPath: string,
  parentCommitHash: string | null,
  commitMessage: string,
): Promise<string> {
  return invoke("git_commit", {
    repoPath,
    parentCommitHash,
    commitMessage,
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
    grammar?: string;
  } = {},
): Promise<string> {
  return await invoke("gpt_predict", {
    prompt,
    nEval: numEval,
    stopSequences: options.stopSequences,
    temperature: options.temperature,
    grammar: options.grammar,
  });
}

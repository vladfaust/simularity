import { invoke } from "@tauri-apps/api";

export async function gitInit(repoPath: string): Promise<void> {
  return invoke("git_init", { repoPath });
}

export async function gitHead(repoPath: string): Promise<{
  hash: string;
  time: Date;
}> {
  const [hash, time] = (await invoke("git_head", { repoPath })) as [
    string,
    number,
  ];

  return { hash, time: new Date(time * 1000) };
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

type InferOptions = {
  stopSequences?: string[];
  grammar?: string;
  temp?: number;
  topK?: number;
  minP?: number;
  topP?: number;
  tfsZ?: number;
  typicalP?: number;
  mirostat?: {
    tau: number;
    eta: number;
  };
};

export async function gptPredict(
  prompt: string,
  numEval: number,
  options: InferOptions = {},
): Promise<string> {
  return await invoke("gpt_predict", {
    prompt,
    nEval: numEval,
    options,
  });
}

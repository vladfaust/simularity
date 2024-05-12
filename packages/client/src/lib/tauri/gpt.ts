import { invoke } from "@tauri-apps/api";

export async function gptInit(
  gptId: string,
  modelPath: string,
  contextSize: number,
  batchSize: number,
): Promise<string> {
  return await invoke("gpt_init", {
    gptId,
    modelPath,
    contextSize,
    batchSize,
  });
}

export async function gptClear(gptId: string): Promise<void> {
  return await invoke("gpt_clear", { gptId });
}

export async function gptDecode(gptId: string, prompt: string): Promise<void> {
  return await invoke("gpt_decode", {
    gptId,
    prompt,
  });
}

export type InferOptions = {
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

export async function gptInfer(
  gptId: string,
  prompt: string | undefined,
  numEval: number,
  options: InferOptions = {},
): Promise<string> {
  return await invoke("gpt_infer", {
    gptId,
    prompt,
    nEval: numEval,
    options,
  });
}

export async function gptTokenCount(
  modelPath: string,
  prompt: string,
): Promise<number> {
  return await invoke("gpt_token_count", { modelPath, prompt });
}

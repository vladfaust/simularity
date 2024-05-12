import { invoke } from "@tauri-apps/api";

type GptType = "Writer" | "Director";

export async function gptInit(
  gptType: GptType,
  modelPath: string,
  contextSize: number,
  batchSize: number,
): Promise<string> {
  return await invoke("gpt_init", {
    gptType,
    modelPath,
    contextSize,
    batchSize,
  });
}

export async function gptClear(gptType: GptType): Promise<string> {
  return await invoke("gpt_clear", { gptType });
}

export async function gptDecode(
  gptType: GptType,
  prompt: string,
): Promise<string> {
  return await invoke("gpt_decode", {
    gptType,
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
  gptType: GptType,
  prompt: string | undefined,
  numEval: number,
  options: InferOptions = {},
): Promise<string> {
  return await invoke("gpt_infer", {
    gptType,
    prompt,
    nEval: numEval,
    options,
  });
}

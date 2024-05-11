import { invoke } from "@tauri-apps/api";

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

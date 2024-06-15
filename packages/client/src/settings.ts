import { Store } from "tauri-plugin-store-api";

const store = new Store(".settings.dat");

async function storeSet(key: string, value: any): Promise<void> {
  console.debug("[Store] Set", key, value);
  await store.set(key, value);
}

async function storeGet(key: string): Promise<string | null> {
  const value = (await store.get(key)) as string | null;
  console.debug("[Store] Get", key, value);
  return value;
}

export async function save(): Promise<void> {
  console.debug("[Store] Save");
  await store.save();
}

export async function getGptDriver(): Promise<"local" | "remote" | null> {
  return (await storeGet("gpt:driver")) as "local" | "remote" | null;
}

export async function setGptDriver(driver: "local" | "remote"): Promise<void> {
  return storeSet("gpt:driver", driver);
}

export async function getGptLocalContextSize(): Promise<number | null> {
  const value = await storeGet("gpt:local:contextSize");
  return value ? parseInt(value) : null;
}

export async function setGptLocalContextSize(
  contextSize: number,
): Promise<void> {
  return storeSet("gpt:local:contextSize", contextSize);
}

export async function getGptLocalModelPath(): Promise<string | null> {
  return storeGet("gpt:local:modelPath");
}

export async function setGptLocalModelPath(modelPath: string): Promise<void> {
  return storeSet("gpt:local:modelPath", modelPath);
}

export async function getGptRemoteBaseUrl(): Promise<string | null> {
  return storeGet("gpt:remote:baseUrl");
}

export async function setGptRemoteBaseUrl(baseUrl: string): Promise<void> {
  return storeSet("gpt:remote:baseUrl", baseUrl);
}

export async function getGptRemoteModel(): Promise<string | null> {
  return storeGet("gpt:remote:model");
}

export async function setGptRemoteModel(model: string): Promise<void> {
  return storeSet("gpt:remote:model", model);
}

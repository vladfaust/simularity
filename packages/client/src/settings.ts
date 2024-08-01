import { Store } from "tauri-plugin-store-api";
import { unreachable } from "./lib/utils";

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

export async function getRemoteInferenceUrl(): Promise<string> {
  return (
    (await storeGet(`remote:url`)) ||
    import.meta.env.VITE_DEFAULT_REMOTE_INFERENCE_SERVER_BASE_URL
  );
}

export async function setRemoteInferenceUrl(url: string): Promise<void> {
  return storeSet(`remote:url`, url);
}

export type AgentId = "writer" | "director";
export type AgentDriver = "local" | "remote";

export async function getAgentDriver(id: AgentId): Promise<AgentDriver | null> {
  return (await storeGet(`${id}:driver`)) as AgentDriver | null;
}

export async function setAgentDriver(
  id: AgentId,
  driver: AgentDriver,
): Promise<void> {
  return storeSet(`${id}:driver`, driver);
}

export async function getAgentLocalModelPath(
  id: AgentId,
): Promise<string | null> {
  return storeGet(`${id}:local:modelPath`);
}

export async function setAgentLocalModelPath(
  id: AgentId,
  modelPath: string,
): Promise<void> {
  return storeSet(`${id}:local:modelPath`, modelPath);
}

export async function getAgentRemoteModel(id: AgentId): Promise<string> {
  const stored = await storeGet(`${id}:remote:model`);
  if (stored) return stored;

  switch (id) {
    case "writer":
      return import.meta.env.VITE_DEFAULT_REMOTE_WRITER_MODEL;
    case "director":
      return import.meta.env.VITE_DEFAULT_REMOTE_DIRECTOR_MODEL;
    default:
      throw unreachable(id);
  }
}

export async function setAgentRemoteModel(
  id: AgentId,
  model: string,
): Promise<void> {
  return storeSet(`${id}:remote:model`, model);
}

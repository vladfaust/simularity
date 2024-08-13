import { StorageSerializers, useLocalStorage } from "@vueuse/core";
import { RemoteLlmDriverConfig } from "./lib/inference/RemoteLlmDriver";
import { TauriLlmDriverConfig } from "./lib/inference/TauriLlmDriver";

export type LlmDriverConfig = TauriLlmDriverConfig | RemoteLlmDriverConfig;

/**
 * Allows to avoid expensive model loading.
 */
export type CachedLlm = {
  path: string;
  modelHash: string;

  /**
   * If the file was modified, the cache is invalid.
   */
  modifiedAt: number;

  contextSize: number;
  nParams: number;
  ramSize: number;
};

export function compareDriverConfigs(a: LlmDriverConfig, b: LlmDriverConfig) {
  switch (a.type) {
    case "tauri":
      return b.type !== "tauri" || a.modelPath === b.modelPath;
    case "remote":
      return b.type !== "remote" || a.modelId === b.modelId;
  }
}

/**
 * Use to check if a model is cached.
 */
export function getCachedLlm(modelPath: string): CachedLlm | null {
  const fetched = localStorage.getItem(`cachedLlms:${btoa(modelPath)}`);
  if (!fetched) return null;
  return JSON.parse(fetched);
}

/**
 * @see {@link getCachedLlm}.
 */
export function setCachedLlm(modelPath: string, value: CachedLlm) {
  localStorage.setItem(`cachedLlms:${btoa(modelPath)}`, JSON.stringify(value));
}

/**
 * Stored driver configuration for the Writer LLM.
 */
export const writerDriverConfig = useLocalStorage<LlmDriverConfig | null>(
  "writerDriverConfig",
  null,
  { serializer: StorageSerializers.object },
);

export const latestWriterSessionId = useLocalStorage<string | null>(
  "latestWriterSessionId",
  null,
);

// ADHOC:
export const latestWriterLocalModelPath = useLocalStorage<string | null>(
  "latestWriterLocalModelPath",
  null,
);

// ADHOC:
export const latestWriterRemoteModelId = useLocalStorage<string | null>(
  "latestWriterRemoteModelId",
  null,
);

/**
 * Models added by user explicitly.
 */
export const customWriterModelPaths = useLocalStorage<string[]>(
  "customWriterModelPaths",
  [],
);

/**
 * Stored driver configuration for the Director LLM.
 */
export const directorDriverConfig = useLocalStorage<LlmDriverConfig | null>(
  "directorDriverConfig",
  null,
  { serializer: StorageSerializers.object },
);

export const latestDirectorSessionId = useLocalStorage<string | null>(
  "latestDirectorSessionId",
  null,
);

// ADHOC:
export const latestDirectorLocalModelPath = useLocalStorage<string | null>(
  "latestDirectorLocalModelPath",
  null,
);

// ADHOC:
export const latestDirectorRemoteModelId = useLocalStorage<string | null>(
  "latestDirectorRemoteModelId",
  null,
);

export const remoteServerJwt = useLocalStorage<string | null>(
  "remoteServerJwt",
  null,
);

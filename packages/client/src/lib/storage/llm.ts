import { type RemoteLlmDriverConfig } from "@/lib/ai/llm/RemoteLlmDriver";
import { type TauriLlmDriverConfig } from "@/lib/ai/llm/TauriLlmDriver";
import { StorageSerializers, useLocalStorage } from "@vueuse/core";
import { type Ref } from "vue";

export type LlmDriverConfig = TauriLlmDriverConfig | RemoteLlmDriverConfig;
export type LlmAgentId = "writer" | "director";

// Model cache.
//

/**
 * Allows to avoid expensive model loading.
 */
export type CachedModel = {
  path: string;
  modelHash: string;

  /**
   * Unix timestamp in milliseconds.
   * If the file was modified, the cache is invalid.
   */
  modifiedAt: number;

  contextSize: number;
  nParams: number;
  ramSize: number;
};

/**
 * Use to check if a model is cached.
 */
export function getCachedModel(modelPath: string): CachedModel | null {
  const fetched = localStorage.getItem(`llm:cachedModel:${btoa(modelPath)}`);
  if (!fetched) return null;
  return JSON.parse(fetched);
}

/**
 * @see {@link getCachedModel}.
 */
export function setCachedModel(modelPath: string, value: CachedModel) {
  localStorage.setItem(
    `llm:cachedModel:${btoa(modelPath)}`,
    JSON.stringify(value),
  );
}

// Custom models.
//

function _useCustomModels(agent: LlmAgentId) {
  return useLocalStorage<string[]>(`llm:${agent}:customModels`, []);
}

const writerCustomModels = _useCustomModels("writer");
const directorCustomModels = _useCustomModels("director");

export function useCustomModels(agent: LlmAgentId): Ref<string[]> {
  switch (agent) {
    case "writer":
      return writerCustomModels;
    case "director":
      return directorCustomModels;
  }
}

// Latest session ID.
//

export type LatestSession = {
  driver: LlmDriverConfig["type"];
  id: number;
};

function _useLatestSession(agent: LlmAgentId) {
  return useLocalStorage<LatestSession | null>(
    `llm:${agent}:latestSession`,
    null,
    { serializer: StorageSerializers.object },
  );
}

const latestWriterSession = _useLatestSession("writer");
const latestDirectorSession = _useLatestSession("director");

/**
 * Use to get the latest session object.
 */
export function useLatestSession(agent: LlmAgentId): Ref<LatestSession | null> {
  switch (agent) {
    case "writer":
      return latestWriterSession;
    case "director":
      return latestDirectorSession;
  }
}

// Driver config storage.
//

function _useDriverConfig(agent: LlmAgentId) {
  return useLocalStorage<LlmDriverConfig | null>(`llm:${agent}:config`, null, {
    serializer: StorageSerializers.object,
  });
}

const writerDriverConfig = _useDriverConfig("writer");
const directorDriverConfig = _useDriverConfig("director");

export function useDriverConfig(
  agent: LlmAgentId,
): Ref<LlmDriverConfig | null> {
  switch (agent) {
    case "writer":
      return writerDriverConfig;
    case "director":
      return directorDriverConfig;
  }
}

// Local model config storage.
//

type LocalModelConfig = {
  modelPath: string;
};

function _useLatestLocalModelConfig(agent: LlmAgentId) {
  return useLocalStorage<LocalModelConfig | null>(
    `llm:${agent}:latestLocalModelConfig`,
    null,
    { serializer: StorageSerializers.object },
  );
}

const latestWriterLocalModelConfig = _useLatestLocalModelConfig("writer");
const latestDirectorLocalModelConfig = _useLatestLocalModelConfig("director");

export function useLatestLocalModelConfig(
  agent: LlmAgentId,
): Ref<LocalModelConfig | null> {
  switch (agent) {
    case "writer":
      return latestWriterLocalModelConfig;
    case "director":
      return latestDirectorLocalModelConfig;
  }
}

// Remote model config storage.
//

type RemoteModelConfig = {
  modelId: string;
};

function _useLatestRemoteModelConfig(agent: LlmAgentId) {
  return useLocalStorage<RemoteModelConfig | null>(
    `llm:${agent}:latestRemoteModelConfig`,
    null,
    { serializer: StorageSerializers.object },
  );
}

const latestWriterRemoteModelConfig = _useLatestRemoteModelConfig("writer");
const latestDirectorRemoteModelConfig = _useLatestRemoteModelConfig("director");

export function useLatestRemoteModelConfig(
  agent: LlmAgentId,
): Ref<RemoteModelConfig | null> {
  switch (agent) {
    case "writer":
      return latestWriterRemoteModelConfig;
    case "director":
      return latestDirectorRemoteModelConfig;
  }
}

export const directorTeacherMode = useLocalStorage<boolean>(
  "llm:director:teacherMode",
  false,
);

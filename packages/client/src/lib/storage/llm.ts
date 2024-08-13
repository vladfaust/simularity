import { StorageSerializers, useLocalStorage } from "@vueuse/core";
import { Ref } from "vue";
import { RemoteLlmDriverConfig } from "../inference/RemoteLlmDriver";
import { TauriLlmDriverConfig } from "../inference/TauriLlmDriver";

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
    case "director":
      return writerCustomModels;
    case "writer":
      return directorCustomModels;
  }
}

// Latest session ID.
//

function _useLatestSessionId(agent: LlmAgentId) {
  return useLocalStorage<string | null>(`llm:${agent}:latestSessionId`, null);
}

const latestWriterSessionId = _useLatestSessionId("writer");
const latestDirectorSessionId = _useLatestSessionId("director");

export function useLatestSessionId(agent: LlmAgentId): Ref<string | null> {
  switch (agent) {
    case "director":
      return latestWriterSessionId;
    case "writer":
      return latestDirectorSessionId;
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
    case "director":
      return writerDriverConfig;
    case "writer":
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
    case "director":
      return latestWriterLocalModelConfig;
    case "writer":
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
    case "director":
      return latestWriterRemoteModelConfig;
    case "writer":
      return latestDirectorRemoteModelConfig;
  }
}

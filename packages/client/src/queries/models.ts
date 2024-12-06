import type { CompletionOptions } from "@/lib/ai/llm/BaseLlmDriver";
import * as api from "@/lib/api";
import type { LlmAgentId } from "@/lib/storage/llm";
import type { QueryOptions } from "@/queries";
import type { MultiLocaleText } from "@simularity/api/lib/schema";
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";

/**
 * A local well-known model, stored in a JSON file.
 */
export type WellKnownLocalModel = {
  name: string;
  description: MultiLocaleText;
  imgUrl?: string;
  nParams: number;
  contextSize: number;
  hfUrl: string;
  locales: string[];

  quants: Record<
    string,
    {
      ramSize: number;

      hash: {
        sha256: string;
      };

      urls: {
        hf: string;
      };
    }
  >;

  recommendedParameters?: CompletionOptions;
};

/**
 * A remote well-known model, stored in a JSON file.
 */
export type WellKnownRemoteModel = {
  imgUrl?: string;
  locales: string[];
  recommendedParameters?: CompletionOptions;
};

export function useRemoteLlmModelsQuery(
  agentId: LlmAgentId,
  queryOptions: QueryOptions = {},
) {
  const query = useQuery({
    queryKey: remoteLlmModelsQueryKey(agentId),
    queryFn: () =>
      api.trpc.commandsClient.models.indexLlmModels.query({
        task: agentId,
      }),
    staleTime: Infinity,
    ...queryOptions,
  });

  return {
    query,
    data: computed(() => query.data.value),
  };
}

export function remoteLlmModelsQueryKey(agentId: LlmAgentId) {
  return ["remoteLlmModels", agentId];
}

export function useRemoteTtsModelsQuery(queryOptions: QueryOptions = {}) {
  const query = useQuery({
    queryKey: remoteTtsModelsQueryKey(),
    queryFn: () => api.trpc.commandsClient.models.indexTtsModels.query(),
    staleTime: Infinity,
    ...queryOptions,
  });

  return {
    query,
    data: computed(() => query.data.value),
  };
}

export function remoteTtsModelsQueryKey() {
  return ["remoteTtsModels"];
}

export function useLocalWellKnownLlmModelsQuery(
  agentId: LlmAgentId,
  queryOptions: QueryOptions = {},
) {
  const query = useQuery({
    queryKey: wellKnownModelsQueryKey(agentId, "local"),
    queryFn: () =>
      fetch(`/available_models/${agentId}/local.json`).then((res) =>
        res.json(),
      ) as Promise<Record<string, WellKnownLocalModel>>,
    staleTime: Infinity,
    retry: false, // It is a local file, no need to retry.
    ...queryOptions,
  });

  return {
    query,
    data: computed(() => query.data.value),
  };
}

export function useRemoteWellKnownLlmModelsQuery(
  agentId: LlmAgentId,
  queryOptions: QueryOptions = {},
) {
  const query = useQuery({
    queryKey: wellKnownModelsQueryKey(agentId, "remote"),
    queryFn: () =>
      fetch(`/available_models/${agentId}/remote.json`).then((res) =>
        res.json(),
      ) as Promise<Record<string, WellKnownRemoteModel>>,
    staleTime: Infinity,
    retry: false, // It is a local file, no need to retry.
    ...queryOptions,
  });

  return {
    query,
    data: computed(() => query.data.value),
  };
}

function wellKnownModelsQueryKey(
  agentId: LlmAgentId,
  kind: "local" | "remote",
) {
  return ["wellKnownModels", agentId, kind];
}

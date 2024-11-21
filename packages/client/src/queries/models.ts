import * as api from "@/lib/api";
import type { LlmAgentId } from "@/lib/storage/llm";
import type { QueryOptions } from "@/queries";
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";

/**
 * A well-known model, stored in a JSON file.
 */
export type WellKnownModel = {
  name: string;
  description: string;
  nParams: number;
  contextSize: number;
  hfUrl?: string;
  locales?: string[];

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

export function useWellKnownLlmModelsQuery(
  agentId: LlmAgentId,
  queryOptions: QueryOptions = {},
) {
  const query = useQuery({
    queryKey: wellKnownModelsQueryKey(agentId),
    queryFn: () =>
      fetch(`/available_models/${agentId}.json`).then((res) =>
        res.json(),
      ) as Promise<Record<string, WellKnownModel>>,
    staleTime: Infinity,
    retry: false, // It is a local file, no need to retry.
    ...queryOptions,
  });

  return {
    query,
    data: computed(() => query.data.value),
  };
}

export function wellKnownModelsQueryKey(agentId: LlmAgentId) {
  return ["wellKnownModels", agentId];
}

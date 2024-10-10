import * as api from "@/lib/api";
import type { QueryOptions } from "@/lib/queries";
import { SubscriptionTierSchema } from "@simularity/api/lib/schema";
import { useQuery } from "@tanstack/vue-query";
import { get } from "@vueuse/core";
import { computed, type MaybeRef } from "vue";
import { v } from "../valibot";

export function useRemoteScenariosQuery(
  showNsfw: MaybeRef<boolean>,
  nameFilter: MaybeRef<string | undefined>,
  requiredSubscriptionTier: MaybeRef<
    v.InferOutput<typeof SubscriptionTierSchema> | undefined | null
  >,
  queryOptions: QueryOptions = {},
) {
  const query = useQuery({
    queryKey: computed(() =>
      remoteScenariosQueryKey(
        get(showNsfw),
        get(nameFilter),
        get(requiredSubscriptionTier),
      ),
    ),
    queryFn: () =>
      api.trpc.commandsClient.scenarios.indexScenarios.query({
        showNsfw: get(showNsfw),
        nameFilter: get(nameFilter) ?? undefined,
        requiredSubscriptionTier: get(requiredSubscriptionTier),
      }),
    staleTime: Infinity,
    ...queryOptions,
  });

  return {
    query,
    data: computed(() => query.data.value),
  };
}

export function remoteScenariosQueryKey(
  showNsfw: boolean,
  nameFilter: string | undefined,
  requiredSubscriptionTier:
    | v.InferOutput<typeof SubscriptionTierSchema>
    | undefined
    | null,
) {
  return [
    "remoteScenarios",
    { showNsfw, nameFilter, requiredSubscriptionTier },
  ];
}

export function useRemoteScenarioQuery(
  scenarioId: MaybeRef<string | null | undefined>,
  queryOptions: QueryOptions = {},
) {
  const query = useQuery({
    queryKey: computed(() => remoteScenarioQueryKey(get(scenarioId)!)),
    queryFn: () =>
      api.trpc.commandsClient.scenarios.getScenario.query({
        scenarioId: get(scenarioId)!,
      }),
    enabled: computed(() => !!get(scenarioId)),
    staleTime: Infinity,
    ...queryOptions,
  });

  return {
    query,
    data: computed(() => query.data.value),
  };
}

export function remoteScenarioQueryKey(scenarioId: string) {
  return ["remoteScenarios", scenarioId];
}

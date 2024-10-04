import * as api from "@/lib/api";
import { RemoteScenario } from "@/lib/scenario";
import type { QueryOptions } from "@/queries";
import { useQuery } from "@tanstack/vue-query";
import { get } from "@vueuse/core";
import { computed, type MaybeRef } from "vue";

export function useRemoteScenariosQuery(
  showNsfw: MaybeRef<boolean>,
  nameFilter: MaybeRef<string | undefined>,
  queryOptions: QueryOptions = {},
) {
  const query = useQuery({
    queryKey: computed(() =>
      remoteScenariosQueryKey(get(showNsfw), get(nameFilter)),
    ),
    queryFn: () =>
      api.trpc.commandsClient.scenarios.indexScenarios.query({
        showNsfw: get(showNsfw),
        nameFilter: get(nameFilter) ?? undefined,
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
) {
  return ["remoteScenarios", { showNsfw, nameFilter }];
}

export function useRemoteScenarioQuery(
  scenarioId: MaybeRef<string | null | undefined>,
  queryOptions: QueryOptions = {},
) {
  const query = useQuery({
    queryKey: computed(() => remoteScenarioQueryKey(get(scenarioId)!)),
    queryFn: () =>
      api.trpc.commandsClient.scenarios.getScenario
        .query({
          scenarioId: get(scenarioId)!,
        })
        .then((response) => new RemoteScenario(get(scenarioId)!, response)),
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

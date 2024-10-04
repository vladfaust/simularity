import { readAllLocalScenarios, readLocalScenario } from "@/lib/scenario";
import type { QueryOptions } from "@/queries";
import { useQuery } from "@tanstack/vue-query";
import { get } from "@vueuse/core";
import { computed, type MaybeRef } from "vue";

export function useLocalScenariosQuery(queryOptions: QueryOptions = {}) {
  const query = useQuery({
    queryKey: localScenariosQueryKey(),
    queryFn: () => readAllLocalScenarios(),
    retry: false,
    staleTime: Infinity,
    ...queryOptions,
  });

  return {
    query,
    data: computed(() => query.data.value),
  };
}

export function localScenariosQueryKey() {
  return ["localScenarios"];
}

export function useLocalScenarioQuery(
  scenarioId: MaybeRef<string | null | undefined>,
  queryOptions: QueryOptions = {},
) {
  const query = useQuery({
    queryKey: computed(() => localScenarioQueryKey(get(scenarioId)!)),
    queryFn: () => readLocalScenario(get(scenarioId)!),
    enabled: computed(() => !!get(scenarioId)),
    retry: false,
    staleTime: Infinity,
    ...queryOptions,
  });

  return {
    query,
    data: computed(() => query.data.value),
  };
}

export function localScenarioQueryKey(scenarioId: string) {
  return ["localScenarios", scenarioId];
}

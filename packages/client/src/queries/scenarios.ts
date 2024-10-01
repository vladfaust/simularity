import { ensureScenario, readAllScenarios } from "@/lib/scenario";
import type { QueryOptions } from "@/queries";
import { useQuery } from "@tanstack/vue-query";
import { get } from "@vueuse/core";
import { computed, type MaybeRef } from "vue";

export function useScenariosQuery(
  queryOptions: QueryOptions = {
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  },
) {
  const query = useQuery({
    queryKey: scenariosQueryKey(),
    queryFn: () => readAllScenarios(),
    ...queryOptions,
  });

  return {
    query,
    data: computed(() => query.data.value),
  };
}

export function scenariosQueryKey() {
  return ["scenarios"];
}

export function useScenarioQuery(
  scenarioId: MaybeRef<string | undefined>,
  queryOptions: QueryOptions = {
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  },
) {
  const query = useQuery({
    queryKey: computed(() => scenarioQueryKey(get(scenarioId)!)),
    queryFn: () => ensureScenario(get(scenarioId)!),
    enabled: computed(() => !!get(scenarioId)),
    ...queryOptions,
  });

  return {
    query,
    data: computed(() => query.data.value),
  };
}

export function scenarioQueryKey(scenarioId: string) {
  return ["scenarios", scenarioId];
}

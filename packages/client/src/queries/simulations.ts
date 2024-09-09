import { d } from "@/lib/drizzle";
import { ensureScenario, readAllScenarios } from "@/lib/simulation/scenario";
import type { QueryOptions } from "@/queries";
import { useQuery } from "@tanstack/vue-query";
import { get } from "@vueuse/core";
import { and, desc, eq, isNull } from "drizzle-orm";
import { computed, type MaybeRef } from "vue";

export function useScenariosQuery(
  queryOptions: QueryOptions = {
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  },
) {
  return useQuery({
    queryKey: scenariosQueryKey(),
    queryFn: () => readAllScenarios(),
    ...queryOptions,
  });
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
  return useQuery({
    queryKey: scenarioQueryKey(get(scenarioId)!),
    queryFn: () => ensureScenario(get(scenarioId)!),
    enabled: computed(() => !!get(scenarioId)),
    ...queryOptions,
  });
}

export function scenarioQueryKey(scenarioId: string) {
  return ["scenarios", scenarioId];
}

export function useSavesQuery(
  scenarioId: string | undefined,
  queryOptions: QueryOptions = {
    // FIXME: Doesn't actually updates on focus etc.
    // staleTime: Infinity,
    // refetchOnWindowFocus: true,
    // refetchOnMount: true,
  },
) {
  return useQuery({
    queryKey: savesQueryKey(scenarioId),
    queryFn: () => {
      const conditions = [isNull(d.simulations.deletedAt)];

      if (scenarioId) {
        conditions.push(eq(d.simulations.scenarioId, scenarioId));
      }

      return d.db.query.simulations.findMany({
        columns: { id: true, scenarioId: true },
        orderBy: desc(d.simulations.updatedAt),
        where: and(...conditions),
      });
    },
    ...queryOptions,
  });
}

export function savesQueryKey(scenarioId: string | undefined) {
  return ["saves", scenarioId];
}

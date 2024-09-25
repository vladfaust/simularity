import { d } from "@/lib/drizzle";
import type { QueryOptions } from "@/queries";
import { useQuery } from "@tanstack/vue-query";
import { get } from "@vueuse/core";
import { and, desc, eq, isNull } from "drizzle-orm";
import { computed, type MaybeRef } from "vue";

export function useSimulationQuery(
  simulationId: MaybeRef<number>,
  queryOptions: QueryOptions = {},
) {
  const query = useQuery({
    queryKey: computed(() => simulationQueryKey(get(simulationId))),
    queryFn: () =>
      d.db.query.simulations.findFirst({
        where: eq(d.simulations.id, get(simulationId)),
      }),
    ...queryOptions,
  });

  return {
    query,
    data: computed(() => query.data.value),
  };
}

export function simulationQueryKey(simulationId: number) {
  return ["simulations", simulationId];
}

export function useSavesQuery(
  scenarioId: MaybeRef<string | undefined>,
  queryOptions: QueryOptions = {
    staleTime: Infinity,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  },
) {
  const query = useQuery({
    queryKey: computed(() => savesQueryKey(get(scenarioId))),
    queryFn: () => {
      const conditions = [isNull(d.simulations.deletedAt)];

      if (get(scenarioId)) {
        conditions.push(eq(d.simulations.scenarioId, get(scenarioId)!));
      }

      return d.db.query.simulations.findMany({
        columns: { id: true, scenarioId: true },
        orderBy: desc(d.simulations.updatedAt),
        where: and(...conditions),
      });
    },
    ...queryOptions,
  });

  return {
    query,
    data: computed(() => query.data.value),
  };
}

export function savesQueryKey(scenarioId: string | undefined) {
  return ["saves", scenarioId];
}

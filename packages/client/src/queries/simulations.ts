import { d } from "@/lib/drizzle";
import { Mode } from "@/lib/simulation";
import { useLocalScenariosQuery, type QueryOptions } from "@/queries";
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
  scenarioId: MaybeRef<string>,
  filterByImmersion?: MaybeRef<boolean | undefined>,
  queryOptions: QueryOptions = {
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  },
) {
  const { data: scenarios } = useLocalScenariosQuery();

  const query = useQuery({
    queryKey: computed(() =>
      savesQueryKey(get(scenarioId), get(filterByImmersion)),
    ),
    queryFn: () => {
      const conditions = [
        isNull(d.simulations.deletedAt),
        eq(d.simulations.scenarioId, get(scenarioId)!),
      ];

      if (get(filterByImmersion) !== undefined) {
        conditions.push(
          eq(
            d.simulations.mode,
            get(filterByImmersion)! ? Mode.Immersive : Mode.Chat,
          ),
        );
      }

      return d.db.query.simulations.findMany({
        columns: {
          id: true,
          scenarioId: true,
          updatedAt: true,
          createdAt: true,
        },
        orderBy: desc(d.simulations.updatedAt),
        where: and(...conditions),
      });
    },
    enabled: computed(() => scenarios.value !== undefined),
    ...queryOptions,
  });

  return {
    query,
    data: computed(() => query.data.value),
  };
}

export function allSavesQueryKey() {
  return ["saves"];
}

export function savesQueryKey(scenarioId: string, filterByImmersion?: boolean) {
  return ["saves", { scenarioId, filterByImmersion }];
}

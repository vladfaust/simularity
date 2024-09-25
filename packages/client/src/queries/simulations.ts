import { d } from "@/lib/drizzle";
import { useScenariosQuery, type QueryOptions } from "@/queries";
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
  includeNsfw?: MaybeRef<boolean>,
  scenarioNameFilter?: MaybeRef<string | undefined>,
  queryOptions: QueryOptions = {
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  },
) {
  const { data: scenarios } = useScenariosQuery();

  const query = useQuery({
    queryKey: computed(() =>
      savesQueryKey(get(scenarioId), get(includeNsfw), get(scenarioNameFilter)),
    ),
    queryFn: async () => {
      const conditions = [isNull(d.simulations.deletedAt)];

      if (get(scenarioId)) {
        conditions.push(eq(d.simulations.scenarioId, get(scenarioId)!));
      }

      let saves = await d.db.query.simulations.findMany({
        columns: { id: true, scenarioId: true },
        orderBy: desc(d.simulations.updatedAt),
        where: and(...conditions),
      });

      if (get(includeNsfw) === false) {
        saves = saves.filter((save) => {
          const scenario = scenarios.value!.find(
            (s) => s.id === save.scenarioId,
          );
          return scenario && !scenario.content.nsfw;
        });
      }

      if (!get(scenarioId) && get(scenarioNameFilter)) {
        saves = saves.filter((save) => {
          const scenario = scenarios.value!.find(
            (s) => s.id === save.scenarioId,
          );

          return (
            scenario &&
            scenario.content.name
              .toLowerCase()
              .includes(get(scenarioNameFilter)!.toLowerCase().trim())
          );
        });
      }

      return saves;
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

export function savesQueryKey(
  scenarioId: string | undefined,
  includeNsfw: boolean | undefined,
  scenarioNameFilter: string | undefined,
) {
  return [
    "saves",
    {
      scenarioId,
      includeNsfw,
      scenarioNameFilter: scenarioNameFilter?.toLowerCase().trim() || undefined,
    },
  ];
}

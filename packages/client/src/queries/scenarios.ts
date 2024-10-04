import { type QueryOptions } from "@/queries";
import { computed, type MaybeRef } from "vue";
import { useLocalScenarioQuery, useRemoteScenarioQuery } from "./scenarios";

export * from "./scenarios/local";
export * from "./scenarios/remote";

export function useScenarioQuery(
  scenarioId: MaybeRef<string | null | undefined>,
  queryOptions: QueryOptions = {},
) {
  const { data: localScenario } = useLocalScenarioQuery(
    scenarioId,
    queryOptions,
  );

  const { data: remoteScenario } = useRemoteScenarioQuery(
    scenarioId,
    queryOptions,
  );

  return computed(() => localScenario.value ?? remoteScenario.value);
}

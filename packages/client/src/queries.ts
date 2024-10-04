import type {
  QueryObserverResult,
  UseQueryReturnType,
} from "@tanstack/vue-query";
import { until } from "@vueuse/core";
import { type MaybeRef } from "vue";

export * from "./queries/account";
export * from "./queries/models";
export * from "./queries/scenarios";
export * from "./queries/simulations";

export type QueryOptions = {
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
  refetchInterval?: MaybeRef<number>;
  enabled?: MaybeRef<boolean>;
  refetchOnMount?: boolean;
  throwOnError?: boolean;
};

/**
 * Wait until the query is fetched, then return its data.
 */
export async function untilFetched<T, E>(
  query: UseQueryReturnType<T, E> | QueryObserverResult<T, E>,
) {
  await until(query.isFetched).toBeTruthy();
  return query.data;
}

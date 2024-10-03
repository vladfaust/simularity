import * as api from "@/lib/api";
import * as storage from "@/store";
import type { QueryOptions } from "@/lib/queries";
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";

export function useAccountQuery(
  queryOptions: QueryOptions = {
    staleTime: Infinity,
  },
) {
  return useQuery({
    queryKey: accountQueryKey(),
    queryFn: () => api.trpc.commandsClient.account.get.query(),
    enabled: computed(() => !!storage.userId.value),
    ...queryOptions,
  });
}

export function accountQueryKey() {
  return ["account"];
}

export function useAccountBalanceQuery(queryOptions: QueryOptions = {}) {
  return useQuery({
    queryKey: accountBalanceQueryKey(),
    queryFn: () => api.trpc.commandsClient.account.balance.query(),
    enabled: computed(() => !!storage.userId.value),
    ...queryOptions,
  });
}

export function accountBalanceQueryKey() {
  return ["account.balance"];
}

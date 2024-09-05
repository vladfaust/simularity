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
    queryFn: () => api.account.get(),
    enabled: computed(() => !!storage.jwt.value),
    ...queryOptions,
  });
}

export function accountQueryKey() {
  return ["account"];
}

export function useAccountBalanceQuery(queryOptions: QueryOptions = {}) {
  return useQuery({
    queryKey: accountBalanceQueryKey(),
    queryFn: () => api.account.getBalance(),
    enabled: computed(() => !!storage.jwt.value),
    ...queryOptions,
  });
}

export function accountBalanceQueryKey() {
  return ["account.balance"];
}

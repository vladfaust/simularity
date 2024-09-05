import * as api from "@/lib/api";
import * as storage from "@/lib/storage";
import type { QueryOptions } from "@/queries";
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";

export function useAccountQuery(queryOptions: QueryOptions = {}) {
  return useQuery({
    queryKey: accountQueryKey(),
    queryFn: () =>
      api.v1.account.get(
        import.meta.env.VITE_API_BASE_URL,
        storage.remoteServerJwt.value!,
      ),
    enabled: computed(() => !!storage.remoteServerJwt.value),
    ...queryOptions,
  });
}

export function accountQueryKey() {
  return ["account"];
}

export function useAccountBalanceQuery(queryOptions: QueryOptions = {}) {
  return useQuery({
    queryKey: accountBalanceQueryKey(),
    queryFn: () =>
      api.v1.account.getBalance(
        import.meta.env.VITE_API_BASE_URL,
        storage.remoteServerJwt.value!,
      ),
    enabled: computed(() => !!storage.remoteServerJwt.value),
    ...queryOptions,
  });
}

export function accountBalanceQueryKey() {
  return ["account.balance"];
}

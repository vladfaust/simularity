import * as api from "@/lib/api";
import * as storage from "@/lib/storage";
import type { QueryOptions } from "@/queries";
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";

export function useAccountQuery(queryOptions: QueryOptions = {}) {
  return useQuery({
    queryKey: accountQueryKey(),
    queryFn: () => api.trpc.commandsClient.account.get.query(),
    enabled: computed(() => !!storage.user.id.value),
    ...queryOptions,
  });
}

export function accountQueryKey() {
  return ["account"];
}

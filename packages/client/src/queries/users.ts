import * as api from "@/lib/api";
import * as storage from "@/lib/storage";
import type { QueryOptions } from "@/queries";
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";

export function useCurrentUserQuery(
  queryOptions: QueryOptions = {
    staleTime: Infinity,
  },
) {
  return useQuery({
    queryKey: currentUserQueryKey(),
    queryFn: () =>
      api.v1.users.get(
        import.meta.env.VITE_API_BASE_URL,
        storage.remoteServerJwt.value!,
      ),
    enabled: computed(() => !!storage.remoteServerJwt.value),
    ...queryOptions,
  });
}

export function currentUserQueryKey() {
  return ["currentUser"];
}

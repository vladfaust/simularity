import * as api from "@/lib/api";
import * as storage from "@/lib/storage";
import type { QueryOptions } from "@/queries";
import { useQuery } from "@tanstack/vue-query";

export function useModelsQuery(
  queryOptions: QueryOptions = {
    staleTime: Infinity,
  },
) {
  return useQuery({
    queryKey: modelsQueryKey(),
    queryFn: () =>
      api.v1.models.index(
        import.meta.env.VITE_API_BASE_URL,
        storage.remoteServerJwt.value,
      ),
    ...queryOptions,
  });
}

export function modelsQueryKey() {
  return ["models"];
}

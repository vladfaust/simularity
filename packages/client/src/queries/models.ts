import * as api from "@/lib/api";
import type { QueryOptions } from "@/queries";
import { useQuery } from "@tanstack/vue-query";

export function useModelsQuery(
  queryOptions: QueryOptions = {
    staleTime: Infinity,
  },
) {
  return useQuery({
    queryKey: modelsQueryKey(),
    queryFn: () => api.trpc.commandsClient.models.index.query(),
    ...queryOptions,
  });
}

export function modelsQueryKey() {
  return ["models"];
}

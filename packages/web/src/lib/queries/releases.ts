import * as api from "@/lib/api";
import { useQuery } from "@tanstack/vue-query";
import type { QueryOptions } from "../queries";

export function useLatestReleaseQuery(queryOptions: QueryOptions = {}) {
  const query = useQuery({
    queryKey: releaseQueryKey("latest"),
    queryFn: api.rest.v1.releases.latestRelease,
    staleTime: Infinity,
    throwOnError: true,
    ...queryOptions,
  });

  return {
    query,
    data: query.data,
  };
}

export function releaseQueryKey(version: string) {
  return ["releases", version];
}

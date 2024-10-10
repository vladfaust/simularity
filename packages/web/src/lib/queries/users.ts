import * as api from "@/lib/api";
import { useQuery } from "@tanstack/vue-query";
import { get } from "@vueuse/core";
import { computed, type MaybeRef } from "vue";
import type { QueryOptions } from "../queries";

export function useUserQuery(
  userId: MaybeRef<string>,
  queryOptions: QueryOptions = {},
) {
  return useQuery({
    queryKey: computed(() => userQueryKey(get(userId))),
    queryFn: () =>
      api.trpc.commandsClient.users.get.query({ userId: get(userId) }),
    staleTime: Infinity,
    ...queryOptions,
  });
}

export function userQueryKey(userId: string) {
  return ["users", userId];
}

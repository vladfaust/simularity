import { type MaybeRef } from "vue";
export * from "./queries/models";
export * from "./queries/users";

export type QueryOptions = {
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
  refetchInterval?: MaybeRef<number>;
  enabled?: MaybeRef<boolean>;
};

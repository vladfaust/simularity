import { type MaybeRef } from "vue";

export * from "./queries/account";
export * from "./queries/scenarios";
export * from "./queries/users";

export type QueryOptions = {
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
  refetchInterval?: MaybeRef<number>;
  enabled?: MaybeRef<boolean>;
};

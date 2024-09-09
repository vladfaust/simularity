import { type MaybeRef } from "vue";

export * from "./queries/account";
export * from "./queries/models";
export * from "./queries/simulations";

export type QueryOptions = {
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
  refetchInterval?: MaybeRef<number>;
  enabled?: MaybeRef<boolean>;
  refetchOnMount?: boolean;
};

import { type MaybeRef } from "vue";
export * from "./queries/account";

export type QueryOptions = {
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
  refetchInterval?: MaybeRef<number>;
  enabled?: MaybeRef<boolean>;
};

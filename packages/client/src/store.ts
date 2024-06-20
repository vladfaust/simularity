import { useLocalStorage } from "@vueuse/core";

export const latestGptSessionId = useLocalStorage<string | null>(
  "latestGptSessionId",
  null,
);

import { useLocalStorage } from "@vueuse/core";

export const remoteServerJwt = useLocalStorage<string | null>(
  "remoteServerJwt",
  null,
);

export * as llm from "./storage/llm";

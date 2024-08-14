import { useLocalStorage } from "@vueuse/core";

export const remoteServerJwt = useLocalStorage<string | null>(
  "remoteServerJwt",

  // ADHOC: Use the Vite environment variable for the API JWT.
  import.meta.env.VITE_API_JWT,
);

export * as llm from "./storage/llm";

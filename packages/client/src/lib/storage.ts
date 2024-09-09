import { useLocalStorage } from "@vueuse/core";
export * as tts from "./storage/tts";

export const remoteServerJwt = useLocalStorage<string | null>(
  "remoteServerJwt",
  null,
);

export * as llm from "./storage/llm";

/**
 * Ambient volume storage, from 0 to 100.
 */
export const ambientVolumeStorage = useLocalStorage<number>(
  "ambientVolume",
  50,
);

/**
 * Speech volume storage, from 0 to 100.
 */
export const speechVolumeStorage = useLocalStorage<number>("speechVolume", 50);

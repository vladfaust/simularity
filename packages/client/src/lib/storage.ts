import { env } from "@/env";
import { useLocalStorage } from "@vueuse/core";

export * as llm from "./storage/llm";
export * as tts from "./storage/tts";
export * as user from "./storage/user";

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

// IDEA: On first launch, it's null, so we can show a welcome screen.
export const selectedScenarioId = useLocalStorage(
  "selectedScenarioId",
  env.VITE_PRODUCT_ID,
);

export const showUpdateIds = useLocalStorage("showUpdateIds", false);

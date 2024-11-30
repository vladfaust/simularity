import { filterLocale } from "@/logic/i18n";
import { StorageSerializers, useLocalStorage } from "@vueuse/core";
import type { Simulation } from "./simulation";

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
export const selectedScenarioId = useLocalStorage<string | null>(
  "library:selectedScenarioId",
  null,
);

export const showUpdateIds = useLocalStorage("showUpdateIds", false);

export const appLocale = useLocalStorage<Intl.Locale>(
  "app:locale",
  filterLocale(new Intl.Locale(window.navigator.language)),
  {
    deep: false,
    serializer: {
      read: (value) => new Intl.Locale(value),
      write: (value) => value.toString(),
    },
  },
);

export const chatLocale = useLocalStorage<Intl.Locale>(
  "app:chatLocale",
  filterLocale(new Intl.Locale(window.navigator.language)),
  {
    deep: false,
    serializer: {
      read: (value) => new Intl.Locale(value),
      write: (value) => value.toString(),
    },
  },
);

export function enabledCharacterIds(simulation: Simulation) {
  return useLocalStorage<Set<string>>(
    `simulation:${simulation.id}:enabledCharacterIds`,

    // By default, all characters are enabled except
    // [the default one and the narrator].
    new Set([
      ...Object.keys(simulation.scenario.content.characters).filter(
        (characterId) => characterId !== simulation.scenario.defaultCharacterId,
      ),
    ]),

    { serializer: StorageSerializers.set },
  );
}

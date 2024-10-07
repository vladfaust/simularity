import { StorageSerializers, useLocalStorage } from "@vueuse/core";
import { computed } from "vue";
import type { TtsDriverConfig } from "../ai/tts/BaseTtsDriver";

export type TtsConfig = {
  narrator: boolean;
  mainCharacter: boolean;
  otherCharacters: boolean;
  driver?: TtsDriverConfig;
};

export const ttsConfig = useLocalStorage<TtsConfig | null>("ttsConfig", null, {
  serializer: StorageSerializers.object,
});

export const ttsEnabled = computed(
  () =>
    ttsConfig.value?.narrator ||
    ttsConfig.value?.mainCharacter ||
    ttsConfig.value?.otherCharacters,
);

export const enableTextSplitting = useLocalStorage<boolean>(
  "tts:enableTextSplitting",
  true,
);

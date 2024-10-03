import { StorageSerializers, useLocalStorage } from "@vueuse/core";
import type { TtsDriverConfig } from "../ai/tts/BaseTtsDriver";

export type TtsConfig = {
  enabled: boolean;
  narrator: boolean;
  mainCharacter: boolean;
  otherCharacters: boolean;
  driver?: TtsDriverConfig;
};

export const ttsConfig = useLocalStorage<TtsConfig | null>("ttsConfig", null, {
  serializer: StorageSerializers.object,
});

export const enableTextSplitting = useLocalStorage<boolean>(
  "tts:enableTextSplitting",
  true,
);

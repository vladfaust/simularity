import { StorageSerializers, useLocalStorage } from "@vueuse/core";

export type TtsConfig = {
  enabled: boolean;
  narrator: boolean;
  mainCharacter: boolean;
  otherCharacters: boolean;
  model: {
    type: "remote";
    modelId?: string;
  };
};

export const ttsConfig = useLocalStorage<TtsConfig | null>("ttsConfig", null, {
  serializer: StorageSerializers.object,
});

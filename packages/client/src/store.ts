import { StorageSerializers, useLocalStorage } from "@vueuse/core";
import { GptDriver } from "./lib/simularity/gpt";

export const latestGptSession = useLocalStorage<{
  id: string;
  driver: GptDriver;
  staticPromptHash: string | undefined;
  dynamicPromptHash: string | undefined;
} | null>("latestGptSession", null, {
  serializer: StorageSerializers.object,
  deep: false,
  shallow: true,
});

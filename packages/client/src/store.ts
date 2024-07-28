import { StorageSerializers, useLocalStorage } from "@vueuse/core";
import { StoredGptSession } from "./lib/simularity/gpt";

export const latestGptSession = useLocalStorage<StoredGptSession | null>(
  "latestGptSession",
  null,
  {
    serializer: StorageSerializers.object,
    deep: false,
    shallow: true,
  },
);

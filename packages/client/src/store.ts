import { StorageSerializers, useLocalStorage } from "@vueuse/core";
import { StoredGptSession } from "./lib/simularity/gpt";

export const latestWriterSession = useLocalStorage<StoredGptSession | null>(
  "latestWriterSession",
  null,
  {
    serializer: StorageSerializers.object,
    deep: false,
    shallow: true,
  },
);

export const latestDirectorSession = useLocalStorage<StoredGptSession | null>(
  "latestDirectorSession",
  null,
  {
    serializer: StorageSerializers.object,
    deep: false,
    shallow: true,
  },
);

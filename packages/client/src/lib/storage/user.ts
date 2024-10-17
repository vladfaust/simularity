import { useLocalStorage, useNow } from "@vueuse/core";
import { computed } from "vue";

const idStorage = useLocalStorage<string | null>("userId", null, {
  listenToStorageChanges: true,
  writeDefaults: true,
});

export const jwtStorage = useLocalStorage<string | null>("jwt", null, {
  listenToStorageChanges: true,
  writeDefaults: false,
});

const cookieExpiredAtStorage = useLocalStorage<Date | null>(
  "cookieExpiredAt",
  null,
  {
    listenToStorageChanges: true,
    writeDefaults: false,
    serializer: {
      read: (x) => new Date(x),
      write: (x) => x?.toString() || "",
    },
  },
);

export function save(userId: string, jwt: string, cookieMaxAge: number) {
  idStorage.value = userId;
  jwtStorage.value = jwt;
  cookieExpiredAtStorage.value = new Date(new Date().valueOf() + cookieMaxAge);
}

export function clear() {
  idStorage.value = null;
  jwtStorage.value = null;
  cookieExpiredAtStorage.value = null;
}

const now = useNow();

export const id = computed<string | null>(() => {
  if (cookieExpiredAtStorage.value) {
    if (cookieExpiredAtStorage.value > now.value) {
      return idStorage.value;
    } else {
      clear();
      return null;
    }
  } else {
    return null;
  }
});

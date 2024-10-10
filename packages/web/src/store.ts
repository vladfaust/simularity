import { useLocalStorage, useNow } from "@vueuse/core";
import { computed } from "vue";
import { filterLocale } from "./lib/logic/i18n";

const userIdStorage = useLocalStorage<string | null>("userId", null, {
  listenToStorageChanges: true,
  writeDefaults: true,
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

export function saveUser(userId: string, cookieMaxAge: number) {
  userIdStorage.value = userId;
  cookieExpiredAtStorage.value = new Date(new Date().valueOf() + cookieMaxAge);
}

export function clearUser() {
  userIdStorage.value = null;
  cookieExpiredAtStorage.value = null;
}

const now = useNow();

export const userId = computed<string | null>(() => {
  if (cookieExpiredAtStorage.value) {
    if (cookieExpiredAtStorage.value > now.value) {
      return userIdStorage.value;
    } else {
      clearUser();
      return null;
    }
  } else {
    return null;
  }
});

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

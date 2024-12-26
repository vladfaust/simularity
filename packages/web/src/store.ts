import { useLocalStorage } from "@vueuse/core";
import * as jose from "jose";
import { computed } from "vue";

export const jwtStorage = useLocalStorage<string | null>("jwt", null, {
  listenToStorageChanges: true,
});

/**
 * Extract `userId` value from the JWT payload.
 * Returns `null` if the JWT is expired.
 */
export const userId = computed<string | null>(() => {
  if (
    jwtStorage.value &&
    jwtExpiredAt.value !== undefined &&
    (!jwtExpiredAt.value || jwtExpiredAt.value > new Date())
  ) {
    const payload = jose.decodeJwt(jwtStorage.value) as {
      userId: string;
    };

    return payload.userId;
  } else {
    return null;
  }
});

/**
 * Extract `exp` value from the JWT payload.
 * @returns `undefined` if the JWT is not set,
 * `null` if there is no `exp` value in the payload.
 */
const jwtExpiredAt = computed<Date | undefined | null>(() => {
  if (jwtStorage.value) {
    const v = jose.decodeJwt(jwtStorage.value);
    return v.exp ? new Date(v.exp * 1000) : null;
  } else {
    return undefined;
  }
});

export function saveUser(jwt: string) {
  jwtStorage.value = jwt;
}

export function clearUser() {
  jwtStorage.value = null;
}

export const appLocale = useLocalStorage<Intl.Locale>(
  "app:locale",
  new Intl.Locale("en-US"),
  {
    deep: false,
    serializer: {
      read: (value) => new Intl.Locale(value),
      write: (value) => value.toString(),
    },
  },
);

import { useLocalStorage } from "@vueuse/core";
import { computed } from "vue";
import * as jose from "jose";

export const jwt = useLocalStorage<string | undefined>("jwt", undefined);

/**
 * Logged-in user ID, if any.
 */
export const userId = computed(() => {
  if (!jwt.value) return undefined;
  const payload = jose.decodeJwt(jwt.value) as { uid: string };
  return payload.uid;
});

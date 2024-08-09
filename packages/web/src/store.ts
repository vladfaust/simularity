import { useLocalStorage } from "@vueuse/core";

export const jwt = useLocalStorage<string | undefined>("jwt", undefined);

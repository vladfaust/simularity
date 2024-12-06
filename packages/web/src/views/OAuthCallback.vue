<script setup lang="ts">
import * as api from "@/lib/api";
import { routeLocation } from "@/router";
import { saveUser } from "@/store";
import { useNProgress } from "@vueuse/integrations/useNProgress";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";

const { isLoading } = useNProgress();

const { reason } = defineProps<{
  providerId: "patreon";
  reason: "login" | "link";
}>();

const route = useRoute();
const router = useRouter();
const { code, state, error } = route.query;
const errorRef = ref<Error | undefined>(
  error ? new Error(error as string) : undefined,
);

const isQueryValid = computed(() => {
  return typeof code === "string" && typeof state === "string";
});

onMounted(async () => {
  if (!isQueryValid.value) {
    return;
  }

  isLoading.value = true;

  try {
    const result = await api.trpc.commandsClient.auth.oauth.callback.mutate({
      code: code as string,
      state: state as string,
      reason,
    });

    switch (reason) {
      case "login": {
        saveUser(result.jwt!);
        break;
      }
    }

    if (result.returnUrl) {
      window.location.href = result.returnUrl;
    } else {
      router.push("/");
    }
  } catch (e: any) {
    errorRef.value = e;
    throw e;
  } finally {
    isLoading.value = false;
  }
});

const { t } = useI18n({
  messages: {
    en: {
      loading: "Loading...",
      "back to home": "Back to home",
    },
  },
});
</script>

<template lang="pug">
.grid.h-screen.place-items-center
  .flex.flex-col.items-center.gap-1(v-if="isLoading")
    .dz-loading.dz-loading-spinner.dz-loading-lg
    span {{ t("loading") }}
  .flex.w-full.max-w-md.flex-col.items-center.gap-2(v-else-if="errorRef")
    .dz-alert.dz-alert-error Error: {{ errorRef.message }}
    RouterLink.dz-link(:to="routeLocation({ name: 'Home' })") {{ t("back to home") }}
</template>

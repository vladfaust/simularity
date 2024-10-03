<script setup lang="ts">
import * as api from "@/lib/api";
import { unreachable } from "@/lib/utils";
import { useNProgress } from "@vueuse/integrations/useNProgress";
import { useI18n } from "vue-i18n";

const LOGO_MAP = {
  patreon: "/img/patreon.svg",
} as const;

const TITLE_MAP = {
  patreon: "Patreon",
} as const;

const { isLoading, progress } = useNProgress();

const { t } = useI18n({
  messages: {
    en: {
      "Login with": "Log in with",
    },
  },
});

const { providerId } = defineProps<{
  providerId: "patreon";
}>();

async function login() {
  // NOTE: Does not reset isLoading upon success
  // due to the redirect taking some time.
  //

  isLoading.value = true;
  try {
    const { url } = await api.trpc.commandsClient.auth.oauth.create.mutate({
      providerId,
      reason: "login",
      returnUrl: window.location.href,
    });

    progress.value = 0.8; // Pareto principle.

    // TODO: Instead of redirecting to the OAuth URL, open a popup.
    window.location.href = url;
  } catch {
    isLoading.value = false;
  }
}

function textColor() {
  switch (providerId) {
    case "patreon":
      return "#FFFFFF";
    default:
      throw unreachable(providerId);
  }
}

function bgColor() {
  switch (providerId) {
    case "patreon":
      return "#fc664d";
    default:
      throw unreachable(providerId);
  }
}
</script>

<template lang="pug">
button.dz-btn.dz-btn-md(
  :style="{ backgroundColor: bgColor(), color: textColor() }"
  :isLoading="isLoading"
  :disabled="isLoading"
  :title="t('Login with') + ' ' + TITLE_MAP[providerId]"
  @click="login"
)
  span.font-medium {{ t("Login with") }}
  img.h-6(:src="LOGO_MAP[providerId]" :alt="TITLE_MAP[providerId] + ' logo'")
</template>

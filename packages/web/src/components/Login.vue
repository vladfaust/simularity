<script setup lang="ts">
import Email from "@/components/Login/Email.vue";
import router, { routeLocation } from "@/router";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import OAuthLoginButton from "./Login/OAuthLoginButton.vue";

const PROVIDER_IDS = ["patreon"] as const;

const emit = defineEmits<{
  (event: "close"): void;
  (event: "login", justCreated: boolean): void;
}>();

const emailCodeSent = ref(false);

function onLogin() {
  router.push(routeLocation({ name: "Home" }));
}

const { t } = useI18n({
  messages: {
    en: {
      login: "Log in",
    },
  },
});
</script>

<template lang="pug">
.flex.flex-col.items-center
  h1.text-lg.font-medium {{ t("login") }}
  .flex.w-full.flex-col.gap-2.rounded-lg.border.bg-base-100.p-3
    Email.gap-2(
      @send-code="emailCodeSent = true"
      @cancel="emailCodeSent = false"
      @login="onLogin"
    )
    template(v-if="!emailCodeSent")
      .flex.items-center.gap-2
        .h-px.w-full.bg-slate-200
        span.leading-none {{ t("or") }}
        .h-px.w-full.bg-slate-200
      template(v-for="providerId of PROVIDER_IDS")
        OAuthLoginButton.w-full(
          :provider-id="providerId"
          @login="emit('login', $event)"
        )
</template>

<script setup lang="ts">
import * as storage from "@/lib/storage";
import { tap } from "@/lib/utils";
import { onLoginButtonClick } from "@/logic/loginButton";
import { useAccountBalanceQuery } from "@/queries";
import { routeLocation } from "@/router";
import {
  HistoryIcon,
  LibraryBigIcon,
  Loader2Icon,
  LogInIcon,
  UserCircle2Icon,
} from "lucide-vue-next";
import { ref } from "vue";

const loginInProgress = ref(false);
const accountBalanceQuery = useAccountBalanceQuery();

async function login() {
  onLoginButtonClick(loginInProgress, true, true);
}
</script>

<template lang="pug">
.grid.h-full.px-3(style="grid-template-columns: 1fr auto 1fr")
  .flex
    RouterLink._header-link(:to="routeLocation({ name: 'Library' })")
      LibraryBigIcon(:size="20")
      span Library

    RouterLink._header-link(:to="routeLocation({ name: 'Saves' })")
      HistoryIcon(:size="20")
      span Recent

  .flex.items-center.justify-center
    RouterLink._header-link(:to="routeLocation({ name: 'Home' })")
      img.-mb-2.h-8(src="/img/logo.svg" alt="Logo")

  .flex.items-center.justify-end.gap-2
    span.font-mono(v-if="accountBalanceQuery.data.value") {{ tap(accountBalanceQuery.data.value.credit, parseFloat) ?? 0 }}¢
    RouterLink._header-link(
      v-if="storage.remoteServerJwt.value"
      :to="routeLocation({ name: 'User' })"
    )
      UserCircle2Icon(:size="20")
      span Account

    button.btn.btn-md.h-max.rounded-lg.border.px-3.py-1.tracking-wide.transition-transform.pressable(
      v-else
      @click="login"
      :disabled="loginInProgress"
    )
      Loader2Icon.animate-spin(
        v-if="loginInProgress"
        :size="18"
        :stroke-width="2.5"
      )
      LogInIcon(v-else :size="18" :stroke-width="2.5")
      span Log in
</template>

<style lang="scss" scoped>
._header-link {
  @apply flex h-full items-center gap-1 border-y-4 border-t-transparent p-3 font-semibold tracking-wide;

  &.router-link-active {
    @apply border-b-primary-500;
  }

  &.router-link-exact-active,
  &:hover {
    @apply border-b-primary-500 text-primary-500;
  }
}
</style>

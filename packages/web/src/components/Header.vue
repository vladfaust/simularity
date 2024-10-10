<script setup lang="ts">
import { routeLocation } from "@/router";
import { userId } from "@/store";
import {
  CircleDollarSignIcon,
  LogInIcon,
  UserCircle2Icon,
} from "lucide-vue-next";
</script>

<template lang="pug">
.flex.justify-center.px-3
  .flex.w-full.max-w-4xl.items-center.justify-between.gap-2
    .flex.h-full.shrink-0.items-center.gap-3
      .py-4
        RouterLink.contents(:to="routeLocation({ name: 'Home' })")
          img.-mb-1.h-8.transition-transform.pressable(
            src="/img/logo.svg"
            alt="Logo"
          )

    .flex.h-full.w-full.items-center.justify-end.gap-3
      RouterLink._router-link(:to="routeLocation({ name: 'Pricing' })")
        CircleDollarSignIcon(:size="20")
        span Pricing

      template(v-if="userId")
        RouterLink._router-link(:to="routeLocation({ name: 'Account' })")
          UserCircle2Icon(:size="20")
          | Account

      template(v-else)
        RouterLink._router-link(:to="routeLocation({ name: 'Login' })")
          LogInIcon(:size="18" :stroke-width="2.5")
          | Login
</template>

<style lang="postcss" scoped>
._router-link {
  @apply flex h-full items-center gap-1 border-y-4 border-t-transparent px-3 font-semibold transition-transform pressable;
  @apply hover:text-primary-500;

  &.router-link-active {
    @apply border-b-primary-500 text-primary-500;
  }
}
</style>

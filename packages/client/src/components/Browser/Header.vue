<script setup lang="ts">
import { routeLocation } from "@/router";
import { LibraryBigIcon, UserCircle2Icon } from "lucide-vue-next";
</script>

<template lang="pug">
.flex.h-full.justify-between.px-3
  .flex
    //- RouterLink._header-link(:to="routeLocation({ name: 'Home' })")
    //-   HomeIcon(:size="20")
    //-   span Home

    RouterLink._header-link(:to="routeLocation({ name: 'Library' })")
      LibraryBigIcon(:size="20")
      span Library

  .flex.items-center.py-3
    button.btn.btn-md.h-max.rounded-lg.border.px-3.py-1.tracking-wide.transition-transform.pressable
      UserCircle2Icon(:size="18" :stroke-width="2.5")
      span Log in
</template>

<style lang="scss" scoped>
._header-link {
  @apply flex h-full items-center gap-1 border-y-4 border-y-transparent p-3 font-semibold tracking-wide;

  &.router-link-active {
    @apply border-b-primary-500;
  }

  &.router-link-exact-active,
  &:hover {
    @apply text-primary-500;
  }
}
</style>

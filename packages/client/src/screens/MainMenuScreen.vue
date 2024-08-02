<script setup lang="ts">
import { RouterLink } from "vue-router";
import { routeLocation } from "../lib/router";
import { BookMarkedIcon, BookOpenIcon, SettingsIcon } from "lucide-vue-next";
</script>

<template lang="pug">
.grid.h-screen.place-items-center
  .flex.flex-col.gap-2
    RouterLink.btn.btn-md.transition-transform.pressable(
      :to="routeLocation({ name: 'ChooseScenario' })"
    )
      BookOpenIcon(:size="20")
      span New game
    RouterLink.btn-md.btn.transition-transform.pressable(
      :to="routeLocation({ name: 'LoadSimulations' })"
    )
      BookMarkedIcon(:size="20")
      span Load game
    RouterLink.btn-md.btn.transition-transform.pressable(
      :to="routeLocation({ name: 'Settings' })"
    )
      SettingsIcon(:size="20")
      span Settings
</template>

<style lang="scss" scoped>
.btn {
  @apply rounded-lg border;
}
</style>

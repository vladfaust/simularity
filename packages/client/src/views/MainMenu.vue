<script setup lang="ts">
import { routeLocation } from "@/router";
import { BookMarkedIcon, BookOpenIcon } from "lucide-vue-next";
import { RouterLink } from "vue-router";
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
</template>

<style lang="scss" scoped>
.btn {
  @apply rounded-lg border;
}
</style>

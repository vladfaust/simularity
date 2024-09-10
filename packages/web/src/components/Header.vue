<script setup lang="ts">
import { routeLocation } from "@/router";
import { userId } from "@/store";
</script>

<template lang="pug">
.flex.justify-center
  .flex.w-full.max-w-2xl.items-center.justify-between.p-3
    RouterLink.-mb-1.h-8.transition-transform.pressable(
      :to="routeLocation({ name: 'Home' })"
    )
      img.h-full(src="/img/logo.svg" alt="Logo")

    template(v-if="userId")
      RouterLink.font-medium.tracking-wide.transition-transform.pressable(
        :to="routeLocation({ name: 'Account' })"
      ) Account
    template(v-else)
      RouterLink.dz-btn.dz-btn-primary.dz-btn-sm(
        :to="routeLocation({ name: 'Login' })"
      ) Login
</template>

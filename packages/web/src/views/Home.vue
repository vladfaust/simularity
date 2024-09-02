<script setup lang="ts">
import * as api from "@/lib/api";
import { routeLocation } from "@/router";
import { jwt } from "@/store";
import { watchImmediate } from "@vueuse/core";
import { ref } from "vue";

const user = ref<
  Awaited<ReturnType<typeof api.users.get>> | undefined | null
>();

watchImmediate(jwt, async (jwt) => {
  if (jwt) {
    user.value = await api.users.get();
  } else {
    user.value = null;
  }
});

function logout() {
  jwt.value = null;
}
</script>

<template lang="pug">
.flex.h-screen.flex-col.items-center.justify-center.p-3
  .flex.w-full.max-w-sm.flex-col.items-center.gap-2.rounded-lg.border.p-2
    template(v-if="jwt")
      h1 Welcome home, {{ user?.email }}
      button.dz-btn.dz-btn-neutral.dz-btn-md(@click="logout") Logout
    template(v-else)
      RouterLink.dz-btn.dz-btn-primary.dz-btn-md(
        :to="routeLocation({ name: 'Login' })"
      ) Login
</template>

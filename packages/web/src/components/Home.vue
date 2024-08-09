<script setup lang="ts">
import { jwt } from "@/store";
import { routeLocation } from "@/router";
import { ref } from "vue";
import { getUser } from "@/lib/api";
import { watchImmediate } from "@vueuse/core";

const user = ref<Awaited<ReturnType<typeof getUser>> | undefined | null>();

watchImmediate(jwt, async (jwt) => {
  if (jwt) {
    user.value = await getUser();
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
      h1 Welcome home, {{ user?.username }}
      button.btn.btn-md.btn-neutral.rounded(@click="logout") Logout
    template(v-else)
      RouterLink.btn.btn-md.btn-primary.rounded(
        :to="routeLocation({ name: 'Login' })"
      ) Login
</template>

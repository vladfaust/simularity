<script setup lang="ts">
import Header from "@/components/Browser/Header.vue";
import { remoteServerJwt } from "@/lib/storage";
import router, { routeLocation } from "@/router";
import { LogOutIcon } from "lucide-vue-next";

function logout() {
  remoteServerJwt.value = null;
  router.push(routeLocation({ name: "Home" }));
}
</script>

<template lang="pug">
.flex.h-screen.flex-col.items-center.bg-neutral-100
  .flex.w-full.justify-center.bg-white
    Header.h-full.w-full.max-w-4xl

  .flex.h-full.w-full.items-start.justify-center.border-t.bg-white
    .flex.w-full.max-w-4xl.items-center.justify-between.gap-2.p-3
      h1 User
      button.btn.btn-md.rounded.border(@click="logout")
        LogOutIcon(:size="20")
        span Log out
</template>

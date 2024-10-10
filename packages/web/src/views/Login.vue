<script setup lang="ts">
import HeaderVue from "@/components/Header.vue";
import Login from "@/components/Login.vue";
import * as api from "@/lib/api";
import { routeLocation } from "@/router";
import { userId } from "@/store";
import { onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";

const router = useRouter();
const route = useRoute();

const nonce = route.query.nonce as string | undefined;

onMounted(async () => {
  if (userId.value) {
    console.log("Already logged in");

    if (nonce) {
      console.log("Authorizing nonce", nonce);
      await api.trpc.commandsClient.auth.nonce.authorize.mutate({ nonce });
    }

    await router.push(routeLocation({ name: "Home" }));
  }
});
</script>

<template lang="pug">
.flex.h-screen.flex-col.overflow-y-hidden
  .flex.flex-col.items-center
    HeaderVue.w-full.border-b

  .flex.h-full.flex-col.items-center.justify-center.overflow-y-scroll.bg-neutral-100.p-3.shadow-inner
    .grid.h-full.w-full.max-w-4xl.place-items-center.rounded-lg.bg-white.p-3.shadow-lg
      Login.w-full.max-w-sm.gap-2.rounded-lg
</template>

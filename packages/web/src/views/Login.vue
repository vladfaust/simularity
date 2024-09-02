<script setup lang="ts">
import Login from "@/components/Login.vue";
import * as api from "@/lib/api";
import { routeLocation } from "@/router";
import { jwt } from "@/store";
import { onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";

const router = useRouter();
const route = useRoute();

const nonce = route.query.nonce as string | undefined;

onMounted(async () => {
  if (jwt.value) {
    console.log("Already logged in");

    if (nonce) {
      console.log("Authorizing nonce", nonce);
      await api.auth.nonce.authorize(nonce);
    }

    await router.push(routeLocation({ name: "Home" }));
  }
});
</script>

<template lang="pug">
.flex.h-screen.flex-col.items-center.justify-center.p-3
  Login.w-full.max-w-sm.gap-2.rounded-lg.border.p-2
</template>

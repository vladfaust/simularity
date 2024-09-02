<script setup lang="ts">
import Header from "@/components/Browser/Header.vue";
import * as api from "@/lib/api";
import { remoteServerJwt } from "@/lib/storage";
import router, { routeLocation } from "@/router";
import { LogOutIcon } from "lucide-vue-next";
import { onMounted, ref } from "vue";
import { toast } from "vue3-toastify";

const user = ref<Awaited<ReturnType<typeof api.v1.users.get>> | null>(null);

function logout() {
  remoteServerJwt.value = null;

  router.push(routeLocation({ name: "Home" })).then(() => {
    toast("Logged out", {
      theme: "auto",
      type: "default",
      position: "bottom-right",
      pauseOnHover: false,
    });
  });
}

onMounted(() => {
  if (!remoteServerJwt.value) {
    throw new Error("Not logged in");
  }

  api.v1.users
    .get(import.meta.env.VITE_API_BASE_URL, remoteServerJwt.value)
    .then((response) => {
      user.value = response;
    });
});
</script>

<template lang="pug">
.flex.h-screen.flex-col.items-center.bg-neutral-100
  .flex.w-full.justify-center.bg-white
    Header.h-full.w-full.max-w-4xl

  .flex.h-full.w-full.items-start.justify-center.border-t.bg-white
    .flex.w-full.max-w-4xl.items-center.justify-between.gap-2.p-3
      h1 Email: {{ user?.email }}
      button.btn.btn-md.rounded.border(@click="logout")
        LogOutIcon(:size="20")
        span Log out
</template>

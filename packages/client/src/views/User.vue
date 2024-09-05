<script setup lang="ts">
import Account from "@/components/Account.vue";
import Header from "@/components/Browser/Header.vue";
import router, { routeLocation } from "@/router";
import { toast } from "vue3-toastify";

function logout() {
  router.push(routeLocation({ name: "Home" })).then(() => {
    toast("Logged out", {
      theme: "auto",
      type: "default",
      position: "bottom-right",
      pauseOnHover: false,
    });
  });
}
</script>

<template lang="pug">
.flex.h-screen.flex-col.items-center.bg-neutral-100
  .flex.w-full.justify-center.bg-white
    Header.h-full.w-full.max-w-4xl

  .flex.h-full.w-full.items-start.justify-center.border-t.bg-white
    Account.w-full.max-w-md.gap-2.p-3(@logout="logout")
</template>

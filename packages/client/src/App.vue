<script setup lang="ts">
import { routeLocation } from "@/router";
import { type UnlistenFn } from "@tauri-apps/api/event";
import { appWindow } from "@tauri-apps/api/window";
import { onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();

let unlisten: UnlistenFn | undefined;

onMounted(async () => {
  appWindow
    .onCloseRequested(async (_) => {
      console.log("Close requested");
      router.push(routeLocation({ name: "Shutdown" }));
    })
    .then((unlistenFn) => {
      console.debug("onCloseRequested listener registered");
      unlisten = unlistenFn;
    });
});

onUnmounted(() => {
  unlisten?.();
});
</script>

<template lang="pug">
RouterView(v-slot="{ Component }")
  component(:is="Component" :key="route.path")
</template>

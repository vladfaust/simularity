<script setup lang="ts">
import { routeLocation } from "@/router";
import { type UnlistenFn } from "@tauri-apps/api/event";
import * as tauriWindow from "@tauri-apps/api/window";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();

let unlisten: UnlistenFn | undefined;

onMounted(async () => {
  tauriWindow
    .getCurrentWindow()
    .onCloseRequested(async (_) => {
      console.log("Close requested");
      router.push(routeLocation({ name: "Shutdown" }));
    })
    .then((unlistenFn) => {
      console.debug("onCloseRequested listener registered");
      unlisten = unlistenFn;
    });

  onOpenUrl((urls) => {
    // TODO: Handle deep links.
    console.log("deep link:", urls);
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

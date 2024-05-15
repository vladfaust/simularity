<script setup lang="ts">
import { useRoute, useRouter } from "vue-router";
import { appWindow } from "@tauri-apps/api/window";
import { onMounted, onUnmounted } from "vue";
import { type UnlistenFn } from "@tauri-apps/api/event";
import {
  isRegistered,
  register,
  unregister,
} from "@tauri-apps/api/globalShortcut";
import { routeLocation } from "./lib/router";

const route = useRoute();
const router = useRouter();

let unlisten: UnlistenFn | undefined;

async function cleanup() {
  // TODO: Unload the GPTs somehow?
}

onMounted(async () => {
  appWindow
    .onCloseRequested(async (_) => {
      console.log("Close requested");
      router.push(routeLocation({ name: "Shutdown" }));
      await cleanup();
    })
    .then((unlistenFn) => {
      console.debug("onCloseRequested listener registered");
      unlisten = unlistenFn;
    });

  isRegistered("Command+Q").then((registered) => {
    if (!registered) {
      register("Command+Q", async () => {
        console.log("Command+Q pressed");
        unregister("Command+Q");
        router.push(routeLocation({ name: "Shutdown" }));
        await cleanup();
        await appWindow.close();
      }).then(() => {
        console.debug("Command+Q registered");
      });
    }
  });
});

onUnmounted(() => {
  unlisten?.();
  unregister("Command+Q");
});
</script>

<template lang="pug">
RouterView(v-slot="{ Component }")
  component(:is="Component" :key="route.path")
</template>

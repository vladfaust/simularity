<script setup lang="ts">
import { useRoute, useRouter } from "vue-router";
import { writer, director } from "./lib/ai";
import { whenever } from "@vueuse/core";
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

whenever(
  () => writer.initialized.value,
  () => {
    console.log("Writer initialized", writer.modelPath);
  },
);

whenever(
  () => director.initialized.value,
  () => {
    console.log("Director initialized", director.modelPath);
  },
);

let unlisten: UnlistenFn | undefined;

async function cleanup() {
  return await Promise.all([writer.clear(), director.clear()]);
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

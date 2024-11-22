<script setup lang="ts">
import { routeLocation } from "@/router";
import { type UnlistenFn } from "@tauri-apps/api/event";
import * as tauriWindow from "@tauri-apps/api/window";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { selectedScenarioId } from "./lib/storage";

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

  onOpenUrl((deepLinkUrls) => {
    console.debug({ deepLinkUrls });

    if (deepLinkUrls.length > 0) {
      const url = new URL(deepLinkUrls[0]);
      console.log("Deep link url", url);

      if (url.protocol === "simularity:") {
        // simularity://open/scenarios/neurosummer
        const scenarioId = url.pathname.split("/").pop();

        if (scenarioId) {
          console.log("Deep link scenario ID", scenarioId);
          selectedScenarioId.value = scenarioId;
        }
      }
    }
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

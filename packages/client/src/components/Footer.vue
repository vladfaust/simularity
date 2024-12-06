<script setup lang="ts">
import { env } from "@/env";
import * as tauriShell from "@tauri-apps/plugin-shell";

async function onUrlClick() {
  await tauriShell.open(env.VITE_WEB_BASE_URL);
}
</script>

<template lang="pug">
footer.flex.flex-col.items-center
  span.text-sm.leading-snug
    | 2024 ©
    |
    a(href="#" class="hover:link" @click="onUrlClick") Simularity AI
  span.text-xs.leading-snug.opacity-80 v{{ env.VITE_VERSION }} ({{ env.VITE_COMMIT_HASH }})
</template>

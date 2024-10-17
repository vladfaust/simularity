<script lang="ts" setup>
import * as tauriProcess from "@tauri-apps/plugin-process";
import { LoaderIcon } from "lucide-vue-next";
import { onMounted } from "vue";

onMounted(() => {
  tauriProcess.exit();
});
</script>

<template lang="pug">
.grid.h-screen.place-items-center
  .flex.animate-pulse.flex-col.items-center.gap-2
    h1.text-xl.font-bold.uppercase.tracking-wide Simularity is shutting down...
    LoaderIcon.inline-block.origin-center.animate-spin(
      :size="32"
      :stroke-width="2"
    )
    p.text-sm.text-gray-500 Please wait...
</template>

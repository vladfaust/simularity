<script setup lang="ts">
import { onMounted } from "vue";
import { useRoute } from "vue-router";
import { gptInit } from "./lib/tauri";
const route = useRoute();

onMounted(() => {
  const modelPath = import.meta.env.VITE_MODEL_PATH;
  const contextSize = 4096;
  const batchSize = 2048;

  gptInit("Writer", modelPath, contextSize, batchSize).then(() => {
    console.log("Writer initialized", modelPath);
  });

  gptInit("Director", modelPath, contextSize, batchSize).then(() => {
    console.log("Director initialized", modelPath);
  });
});
</script>

<template lang="pug">
RouterView(v-slot="{ Component }")
  component(:is="Component" :key="route.path")
</template>

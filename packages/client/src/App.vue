<script setup lang="ts">
import { onMounted } from "vue";
import { useRoute } from "vue-router";
import { gptInit } from "./lib/tauri";
const route = useRoute();

onMounted(() => {
  gptInit(import.meta.env.VITE_MODEL_PATH).then(() => {
    console.log("GPT model loaded", import.meta.env.VITE_MODEL_PATH);
  });
});
</script>

<template lang="pug">
RouterView(v-slot="{ Component }")
  component(:is="Component" :key="route.path")
</template>

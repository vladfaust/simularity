<script setup lang="ts">
import { useRoute } from "vue-router";
import { writer, director } from "./lib/ai";
import { whenever } from "@vueuse/core";

const route = useRoute();

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
</script>

<template lang="pug">
RouterView(v-slot="{ Component }")
  component(:is="Component" :key="route.path")
</template>

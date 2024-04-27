<script setup lang="ts">
import { useRoute } from "vue-router";
const route = useRoute();
</script>

<template lang="pug">
RouterView(v-slot="{ Component }")
  component(:is="Component" :key="route.path")
</template>

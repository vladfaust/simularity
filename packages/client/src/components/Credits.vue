<script setup lang="ts">
import { CoinsIcon } from "lucide-vue-next";

defineProps<{
  value: number;
  iconSize?: number;
}>();
</script>

<template lang="pug">
.flex
  span.font-mono.font-bold {{ value }}
  CoinsIcon.self-center.text-yellow-500(:size="iconSize")
</template>

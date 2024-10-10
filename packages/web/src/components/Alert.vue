<script setup lang="ts">
import { InfoIcon, TriangleAlertIcon } from "lucide-vue-next";

defineProps<{
  kind: "info" | "error";
}>();
</script>

<template lang="pug">
.flex(
  :class="{ 'bg-primary-500 text-primary-base': kind === 'info', 'bg-error-500 text-error-base': kind === 'error' }"
)
  InfoIcon.shrink-0(v-if="kind === 'info'" :size="24")
  TriangleAlertIcon.shrink-0(v-if="kind === 'error'" :size="24")
  slot(name="default")
</template>

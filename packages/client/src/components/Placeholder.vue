<script setup lang="ts">
defineProps<{ animated?: boolean; as?: string }>();
</script>

<template lang="pug">
component.grid.place-items-center.bg-gray-100(
  :class="{ 'animate-pulse': animated }"
  :is="as || 'div'"
)
  slot
</template>

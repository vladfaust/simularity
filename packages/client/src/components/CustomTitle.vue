<script setup lang="ts">
defineProps<{
  title?: string;
}>();
</script>

<template lang="pug">
.flex.items-center.justify-between.gap-2
  .flex.items-center.gap-1.overflow-x-hidden
    slot(name="icon")
    slot(name="default")
      span.font-semibold.leading-snug.tracking-wide {{ title }}
  .min-w-4.grow.border-b
  .flex.shrink-0.items-center(v-if="$slots.extra")
    slot(name="extra")
</template>

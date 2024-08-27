<script setup lang="ts">
defineProps<{
  title?: string;
}>();
</script>

<template lang="pug">
.flex.items-center.justify-between.gap-2
  .flex.shrink-0.items-center.gap-1
    slot(name="icon")
    .shrink-0
      slot(name="default")
        span.font-semibold.leading-snug.tracking-wide {{ title }}
  .w-full.border-b
  .shrink-0(v-if="$slots.extra")
    slot(name="extra")
</template>

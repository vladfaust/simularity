<script setup lang="ts">
import { CircleHelpIcon } from "lucide-vue-next";

defineProps<{
  title: string;
  id: string;
  help?: string;
}>();
</script>

<template lang="pug">
.flex.items-center.justify-between.gap-2
  .flex.shrink-0.items-center.gap-2
    label.flex.cursor-pointer.items-center.gap-2(:for="id")
      .btn.rounded-lg.border.bg-white.p-1
        slot(name="icon")
      span {{ title }}
    CircleHelpIcon(v-if="help" :size="16" v-tooltip="help")
  .w-full.border-b
  slot(name="default")
</template>

<script setup lang="ts">
import { CircleHelpIcon } from "lucide-vue-next";

defineProps<{
  title: string;
  id: string;
  help?: string;
  disabled?: boolean;
}>();
</script>

<template lang="pug">
.flex.items-center.justify-between.gap-2
  .flex.shrink-0.items-center.gap-2
    label.flex.select-none.items-center.gap-2(
      :for="id"
      :class="{ 'cursor-pointer': !disabled, 'opacity-50 cursor-not-allowed': disabled }"
    )
      .btn.rounded-lg.border.bg-white.p-1
        slot(name="icon")
      span {{ title }}
    .btn.cursor-help.select-none.opacity-50(v-if="help" v-tooltip="help")
      CircleHelpIcon(:size="18")
  .w-full.border-b
  slot(name="default")
</template>

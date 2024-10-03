<script setup lang="ts">
import { CircleChevronLeftIcon, CircleChevronRightIcon } from "lucide-vue-next";

defineProps<{
  canGoPrevious: boolean;
  canGoNext: boolean;
  nextWillRegenerate?: boolean;
  /** 0-based. */
  currentIndex: number;
  totalVariants: number;
}>();

defineEmits<{
  (event: "previous"): void;
  (event: "next"): void;
}>();
</script>

<template lang="pug">
.flex.items-center.gap-1
  button.btn.transition-transform.pressable(
    @click.stop="$emit('previous')"
    :disabled="!canGoPrevious"
    title="Previous variant (←)"
  )
    CircleChevronLeftIcon(:size="18")

  span.text-sm.font-medium.leading-none {{ currentIndex + 1 }} / {{ totalVariants }}

  button.btn.transition-transform.pressable(
    @click.stop="$emit('next')"
    :disabled="!canGoNext"
    :class="{ 'hover:text-ai-500 hover:animate-pulse': nextWillRegenerate }"
    title="Next variant (→)"
  )
    CircleChevronRightIcon(:size="18")
</template>

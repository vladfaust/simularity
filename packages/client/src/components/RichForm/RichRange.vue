<script setup lang="ts">
import RichInput from "./RichInput.vue";

defineProps<{
  title: string;
  id: string;
  help?: string;
  min?: number;
  max?: number;
  percent?: boolean;
}>();

const model = defineModel<number>({ required: true });
</script>

<template lang="pug">
RichInput(:title :id :help v-model="model" clickable)
  template(#icon)
    slot(name="icon")
  .flex.shrink-0.items-center.gap-2
    input(
      type="range"
      :min="min ?? percent ? 0 : undefined"
      :max="max ?? percent ? 100 : undefined"
      v-model.number="model"
    )
    .flex.w-14.items-center.justify-end.rounded-full.border.bg-white.px-2.text-sm.font-medium(
      class="py-0.5"
    ) {{ model }}{{ percent ? "%" : "" }}
</template>

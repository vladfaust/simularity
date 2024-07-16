<script setup lang="ts">
import { EpisodeUpdate } from "@/lib/simulation/updates";
import { computed } from "vue";

const props = defineProps<{
  update: EpisodeUpdate;
  isSingle: boolean;
  selected?: boolean;
}>();

const rootKlass = computed(() => ({
  "rounded-bl-none place-self-start bg-white": !props.update.asIfCreatedByUser,
  "rounded-br-none place-self-end bg-green-100": props.update.asIfCreatedByUser,
  "border-red-500": props.selected,
  "border-white": !props.selected && !props.update.asIfCreatedByUser,
  "border-green-100": !props.selected && props.update.asIfCreatedByUser,
}));
</script>

<template lang="pug">
p.rounded-lg.border-2.px-3.py-3.leading-snug.opacity-90.transition-opacity(
  class="hover:opacity-100"
  :class="rootKlass"
) {{ update.text }}
</template>

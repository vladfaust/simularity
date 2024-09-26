<script setup lang="ts">
import * as api from "@/lib/api";
import { CircleDollarSignIcon } from "lucide-vue-next";

defineProps<{
  model: Extract<
    Awaited<ReturnType<typeof api.v1.models.index>>[number],
    { type: "tts" }
  >;
  selected: boolean;
}>();

defineEmits<{
  (event: "select"): void;
}>();
</script>

<template lang="pug">
.flex.flex-col.gap-2.p-3
  .flex.flex-col.items-center.gap-1
    span.font-bold.leading-tight.tracking-wide {{ model.name }}
    p.text-center.text-sm.leading-tight {{ model.description?.en }}
    .flex.gap-1.text-sm
      CircleDollarSignIcon.self-center(:size="18" :stroke-width="2.5")
      span.self-baseline
        span.font-semibold Price:&nbsp;
        span.font-mono.font-medium.text-secondary-500 {{ model.creditPrice }}¢
        span.cursor-help(title="Per speech minute") &nbsp;/min.

  //- Buttons
  button.btn.btn-sm.w-full.rounded.transition-transform.pressable-sm(
    :class="{ 'btn-primary': selected, 'btn-neutral': !selected }"
    @click="$emit('select')"
  )
    span {{ selected ? "Selected" : "Select" }}
</template>

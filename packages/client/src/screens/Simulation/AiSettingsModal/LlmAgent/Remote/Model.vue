<script setup lang="ts">
import * as api from "@/lib/api";
import { CircleDollarSignIcon, ProportionsIcon } from "lucide-vue-next";

defineProps<{
  model: Awaited<ReturnType<typeof api.v1.models.index>>[number];
  selected: boolean;
}>();

defineEmits<{
  (event: "select"): void;
}>();
</script>

<template lang="pug">
.flex.flex-col.gap-2.p-3
  .flex.flex-col.gap-1
    span.text-center.text-lg.font-semibold.leading-tight.tracking-wide {{ model.name }}
    p.text-center.text-sm.leading-tight {{ model.description?.en }}

    //- Params.
    .flex.flex-wrap.items-center.justify-center.gap-x-2.text-sm
      .flex.gap-1
        ProportionsIcon.self-center(:size="18" :stroke-width="2.5")
        span.self-baseline
          span.font-semibold Context:
          |
          | {{ model.contextSize }}

      .flex.gap-1.text-sm
        CircleDollarSignIcon.self-center(:size="18" :stroke-width="2.5")
        span.self-baseline
          span.font-semibold Price:
          |
          | $0 /1k tokens

  //- Buttons
  button.btn.btn-sm.w-full.rounded.transition-transform.pressable(
    :class="{ 'btn-primary': selected, 'btn-neutral': !selected }"
    @click="$emit('select')"
  )
    span {{ selected ? "Selected" : "Select" }}
</template>

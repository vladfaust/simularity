<script setup lang="ts">
import Credits from "@/components/Credits.vue";
import * as api from "@/lib/api";

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
    .flex.items-center.justify-between.gap-2
      span.shrink-0.font-bold.leading-tight.tracking-wide {{ model.name }}
      .w-full.border-b
      .flex.shrink-0.gap-1
        Credits(:value="2" :iconSize="18" class="gap-0.5")
        span.self-baseline per generation
    p.text-sm.leading-tight {{ model.description?.en }}

  //- Buttons
  button.btn.btn-sm.w-full.rounded.transition-transform.pressable-sm(
    :class="{ 'btn-primary': selected, 'btn-neutral': !selected }"
    @click="$emit('select')"
  )
    span {{ selected ? "Selected" : "Select" }}
</template>

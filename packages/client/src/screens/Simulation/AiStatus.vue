<script setup lang="ts">
import { Simulation } from "@/lib/simulation";
import { computed } from "vue";

enum Status {
  Ready,
  Busy,
}

const { simulation } = defineProps<{
  simulation: Simulation;
}>();

const status = computed<Status | undefined>(() => {
  const writer = simulation.writer.llmDriver.value;
  const director = simulation.director.llmDriver.value;
  if (!writer && !director) return undefined;

  if (writer?.busy.value || director?.busy.value) {
    return Status.Busy;
  } else {
    return Status.Ready;
  }
});

const statusText = computed<string | undefined>(() => {
  switch (status.value) {
    case undefined:
      return "Unknown";
    case Status.Busy:
      return "Busy";
    case Status.Ready:
      return "Ready";
  }
});
</script>

<template lang="pug">
.flex.items-center.gap-1
  .h-2.w-2.shrink-0.rounded-full(
    :class="{ 'bg-green-500': status === Status.Ready, 'bg-yellow-500': status === Status.Busy, 'bg-neutral-500': status === undefined, 'animate-pulse': status === Status.Busy }"
  )
  span.text-sm.leading-none(
    :class="{ 'animate-pulse': status === Status.Busy }"
  ) {{ statusText }}
</template>

<style lang="scss" scoped></style>

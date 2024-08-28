<script setup lang="ts">
import { TauriLlmDriver } from "@/lib/ai/llm/TauriLlmDriver";
import { Simulation } from "@/lib/simulation";
import { CpuIcon } from "lucide-vue-next";
import { computed } from "vue";

enum Status {
  Idle,
  Busy,
}

const { simulation } = defineProps<{
  simulation: Simulation;
}>();

const status = computed<Status>(() => {
  const writerBusy =
    simulation.writer.llmDriver.value instanceof TauriLlmDriver &&
    simulation.writer.llmDriver.value.busy.value;

  const directorBusy =
    simulation.director.llmDriver.value instanceof TauriLlmDriver &&
    simulation.director.llmDriver.value.busy.value;

  if (writerBusy || directorBusy) {
    return Status.Busy;
  } else {
    return Status.Idle;
  }
});

const statusText = computed<string | undefined>(() => {
  switch (status.value) {
    case Status.Busy:
      return "Busy";
    case Status.Idle:
      return "Idle";
  }
});
</script>

<template lang="pug">
.flex.items-center.gap-1
  CpuIcon(
    :size="16"
    :stroke-width="2.5"
    :class="{ 'text-green-500': status === Status.Idle, 'text-yellow-500': status === Status.Busy, 'text-neutral-500': status === undefined, 'animate-pulse': status === Status.Busy }"
  )
  span.font-mono.text-xs.font-semibold.leading-none {{ statusText }}
</template>

<script setup lang="ts">
import { Simulation } from "@/lib/simulation";
import { OctagonAlert } from "lucide-vue-next";
import { computed } from "vue";

enum Status {
  Idle,
  Busy,
}

const { simulation } = defineProps<{
  simulation: Simulation;
}>();

const status = computed<Status | undefined>(() => {
  const writerBusy = simulation.writer.llmDriver.value?.busy.value;
  const directorBusy = simulation.director?.llmDriver.value?.busy.value;

  if (writerBusy || directorBusy) {
    return Status.Busy;
  } else if (simulation.ready.value) {
    return Status.Idle;
  } else {
    return undefined;
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
OctagonAlert.text-error-500(
  v-if="status === undefined"
  v-tooltip="'Needs setup'"
  :size="18"
)
.h-2.w-2.rounded-full(
  v-else
  :size="16"
  :stroke-width="2.5"
  :class="{ 'bg-green-500': status === Status.Idle, 'bg-yellow-500': status === Status.Busy, 'bg-neutral-500': status === undefined, 'animate-pulse': status === Status.Busy }"
  :title="statusText"
)
</template>

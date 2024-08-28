<script setup lang="ts">
import { type BaseLlmDriver } from "@/lib/ai/llm/BaseLlmDriver";
import { clamp } from "@/lib/utils";
import { computed } from "vue";
import StatusIcon from "./StatusIcon.vue";

enum Status {
  Ready,
  Busy,
}

const props = defineProps<{
  driver: BaseLlmDriver | undefined;
}>();

const status = computed<Status | undefined>(() => {
  if (!props.driver) return undefined;
  else if (props.driver.busy.value || !props.driver.ready.value)
    return Status.Busy;
  else return Status.Ready;
});

const statusText = computed<string | undefined>(() => {
  let text;
  switch (status.value) {
    case Status.Busy:
      text = "Busy";
      break;
    case Status.Ready:
      text = "Ready";
      break;
  }

  if (props.driver?.progress.value !== undefined) {
    text += ` (${Math.round(clamp(props.driver.progress.value, 0, 1) * 100)}%)`;
  }

  return text;
});
</script>

<template lang="pug">
.flex.items-center.gap-1
  StatusIcon(:driver)
  span.text-sm.leading-none(
    :class="{ 'animate-pulse': status === Status.Busy }"
  ) {{ statusText }}
</template>

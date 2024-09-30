<script setup lang="ts">
import type { BaseLlmDriver } from "@/lib/ai/llm/BaseLlmDriver";
import { RemoteLlmDriver } from "@/lib/ai/llm/RemoteLlmDriver";
import { TauriLlmDriver } from "@/lib/ai/llm/TauriLlmDriver";
import { CloudIcon, CpuIcon, OctagonAlertIcon } from "lucide-vue-next";
import { computed } from "vue";

enum Status {
  Ready,
  Busy,
}

const props = defineProps<{
  driver: BaseLlmDriver | undefined | null;
  required?: boolean;
}>();

const status = computed<Status | undefined>(() => {
  if (!props.driver) return undefined;
  else if (props.driver.busy.value || !props.driver.ready.value)
    return Status.Busy;
  else return Status.Ready;
});
</script>

<template lang="pug">
.flex.items-center.gap-2
  OctagonAlertIcon.text-error-500(
    v-if="required && status === undefined"
    v-tooltip="'Needs setup'"
    :size="18"
  )
  .h-2.w-2.rounded-full(
    v-else
    :class="{ 'bg-green-500': status === Status.Ready, 'bg-yellow-500': status === Status.Busy, 'bg-gray-500': status === undefined, 'animate-pulse': status === Status.Busy }"
  )
  CpuIcon(
    v-if="driver instanceof TauriLlmDriver && true"
    :class="{ 'animate-pulse': status === Status.Busy }"
    :size="18"
    :stroke-width="2.5"
  )
  CloudIcon(
    v-else-if="driver instanceof RemoteLlmDriver && true"
    :class="{ 'animate-pulse': status === Status.Busy }"
    :size="18"
    :stroke-width="2.5"
  )
</template>

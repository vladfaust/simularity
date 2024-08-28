<script setup lang="ts">
import type { BaseTtsDriver } from "@/lib/ai/tts/BaseTtsDriver";
import { computed } from "vue";

enum Status {
  Ready,
  Busy,
}

const props = defineProps<{
  driver: BaseTtsDriver | undefined | null;
}>();

const status = computed<Status | undefined>(() => {
  if (!props.driver) return undefined;
  else if (props.driver.busy.value || !props.driver.ready.value)
    return Status.Busy;
  else return Status.Ready;
});
</script>

<template lang="pug">
.h-2.w-2.rounded-full(
  :class="{ 'bg-green-500': status === Status.Ready, 'bg-yellow-500': status === Status.Busy, 'bg-gray-500': status === undefined, 'animate-pulse': status === Status.Busy }"
)
</template>

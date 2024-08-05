<script setup lang="ts">
import {
  Gpt,
  GptInitJob,
  GptDecodeJob,
  GptInferJob,
} from "@/lib/simularity/gpt";
import { computed } from "vue";

enum Status {
  Ready,
  Queued,
  Busy,
}

const props = defineProps<{
  gpt: Gpt | undefined;
}>();

const status = computed<Status | undefined>(() => {
  if (!props.gpt) return undefined;
  else if (props.gpt.currentJob.value) return Status.Busy;
  else if (props.gpt.jobs.value.length) return Status.Queued;
  else return Status.Ready;
});

const statusText = computed<string | undefined>(() => {
  const currentJob = props.gpt?.currentJob.value;

  if (currentJob instanceof GptInitJob) {
    return `Initializing (${Math.round(currentJob.progress.value * 100)}%)...`;
  } else if (currentJob instanceof GptDecodeJob) {
    return `Decoding (${Math.round(currentJob.progress.value * 100)}%)...`;
  } else if (currentJob instanceof GptInferJob) {
    if (
      currentJob.decodeProgress.value !== undefined &&
      currentJob.decodeProgress.value < 1
    ) {
      return `Inferring (${Math.round(currentJob.decodeProgress.value * 100)}%)...`;
    } else {
      return "Inferring...";
    }
  } else {
    return "Ready";
  }
});
</script>

<template lang="pug">
.flex.items-center.gap-1
  .h-2.w-2.rounded-full(
    :class="{ 'bg-green-500': status === Status.Ready, 'bg-[chartreuse]': status === Status.Queued, 'bg-yellow-500': status === Status.Busy, 'animate-pulse': status === Status.Busy }"
  )
  span.text-sm.leading-none(
    :class="{ 'animate-pulse': status === Status.Busy }"
  ) {{ statusText }}
</template>

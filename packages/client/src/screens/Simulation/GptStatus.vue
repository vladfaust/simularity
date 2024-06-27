<script setup lang="ts">
import {
  Gpt,
  GptInitJob,
  GptDecodeJob,
  GptInferJob,
  GptCommitJob,
} from "@/lib/ai";
import { computed } from "vue";

enum Status {
  Ready,
  Queued,
  Busy,
}

const props = defineProps<{
  gpt: Gpt | undefined;
  name: string;
}>();

const driver = computed(() => {
  switch (props.gpt?.driver.type) {
    case "local":
      return "Local";
    case "remote":
      return "Remote";
    default:
      return "Unknown";
  }
});

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
  } else if (currentJob instanceof GptCommitJob) {
    return `Committing...`;
  } else {
    return "Ready";
  }
});
</script>

<template lang="pug">
.flex.items-center.gap-1.rounded.bg-white.bg-opacity-90.px-2.py-1.shadow
  span.text-sm.leading-none {{ name }} ({{ driver }})
  .h-2.w-2.rounded-full(
    :class="{ 'bg-green-500': status === Status.Ready, 'bg-[chartreuse]': status === Status.Queued, 'bg-yellow-500': status === Status.Busy, 'animate-pulse': status === Status.Busy }"
  )
  span.text-sm.leading-none(
    :class="{ 'animate-pulse': status === Status.Busy }"
  ) {{ statusText }}
</template>

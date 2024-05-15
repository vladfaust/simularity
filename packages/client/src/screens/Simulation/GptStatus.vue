<script setup lang="ts">
import { Gpt } from "@/lib/ai";
import { CpuIcon } from "lucide-vue-next";
import { computed } from "vue";

enum Status {
  Ready,
  Queued,
  Busy,
}

const props = defineProps<{
  gpt: Gpt | undefined;
  iconSize: number;
}>();

const status = computed<Status | undefined>(() => {
  if (!props.gpt) return undefined;
  else if (props.gpt.currentJob.value) return Status.Busy;
  else if (props.gpt.jobs.value.length) return Status.Queued;
  else return Status.Ready;
});
</script>

<template lang="pug">
.relative.flex.items-center.justify-center
  div
    slot(name="default")

  //- (Local model).
  CpuIcon.absolute.bottom-0.left-0.origin-bottom-left.rounded.text-white(
    class="scale-[0.5] p-[2px]"
    :size="iconSize"
    :class="{ 'bg-green-500': status === Status.Ready, 'bg-[chartreuse]': status === Status.Queued, 'bg-yellow-500': status === Status.Busy, 'animate-pulse': status === Status.Busy }"
  )
</template>

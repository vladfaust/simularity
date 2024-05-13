<script setup lang="ts">
import { Gpt } from "@/lib/ai";
import { CpuIcon } from "lucide-vue-next";
import { computed } from "vue";

const props = defineProps<{
  gpt: Gpt;
  iconSize: number;
}>();

const jobCount = computed(
  () => props.gpt.jobs.value.length + (props.gpt.currentJob.value ? 1 : 0),
);
</script>

<template lang="pug">
.relative.flex.items-center.justify-center(
  :class="{ 'animate-pulse': !gpt.initialized.value || jobCount }"
)
  div
    slot(name="default")
      span {{ gpt.id }}

  //- (Local model).
  CpuIcon.absolute.bottom-0.left-0.origin-bottom-left.rounded.bg-green-600.bg-opacity-80.text-white(
    class="scale-[0.5] p-[2px]"
    :size="iconSize"
  )

  .absolute.flex.aspect-square.items-center.justify-center.rounded-full.bg-blue-500.px-1.font-mono.text-xs.text-white(
    v-if="jobCount"
  )
    span.leading-none {{ jobCount }}
</template>

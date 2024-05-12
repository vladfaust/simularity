<script setup lang="ts">
import { Gpt } from "@/lib/ai";
import { CpuIcon, LoaderIcon } from "lucide-vue-next";

defineProps<{
  gpt: Gpt;
  iconSize: number;
}>();
</script>

<template lang="pug">
.relative
  div(
    :class="{ 'animate-pulse': !gpt.initialized.value || gpt.currentJob.value }"
  )
    slot(name="default")
      span {{ gpt.id }}

  //- (Local model).
  CpuIcon.absolute.bottom-0.left-0.origin-bottom-right.rounded.bg-green-600.bg-opacity-80.text-white(
    class="scale-[0.5] p-[2px]"
    :size="iconSize"
  )

  template(v-if="!gpt.initialized.value || gpt.currentJob.value")
    LoaderIcon.absolute.left-0.top-0.animate-spin.text-white.opacity-90(
      :size="iconSize"
    )
</template>

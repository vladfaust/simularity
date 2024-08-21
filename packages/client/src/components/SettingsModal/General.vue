<script lang="ts" setup>
import { ref } from "vue";
import { ambientVolumeStorage, speechVolumeStorage } from "@/lib/storage";
import { SpeechIcon, TreesIcon } from "lucide-vue-next";

const ambientVolume = ref(ambientVolumeStorage);
</script>

<template lang="pug">
.flex.w-full.flex-col.gap-2.p-3
  //- Ambient volume slider.
  .flex.items-center.justify-between.gap-2
    .flex.shrink-0.items-center.gap-1
      TreesIcon(:size="20")
      span Ambience volume
    .w-full.border-b
    .flex.shrink-0.items-center.gap-1
      input(type="range" min="0" max="100" v-model="ambientVolume")
      span {{ ambientVolume }}%

  //- Speech volume slider.
  .flex.items-center.justify-between.gap-2
    .flex.shrink-0.items-center.gap-1
      SpeechIcon(:size="20")
      span Speech volume
    .w-full.border-b
    .flex.shrink-0.items-center.gap-1
      input(type="range" min="0" max="100" v-model="speechVolumeStorage")
      span {{ speechVolumeStorage }}%
</template>

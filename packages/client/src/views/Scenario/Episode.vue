<script setup lang="ts">
import Placeholder from "@/components/Placeholder.vue";
import { Scenario } from "@/lib/simulation/scenario";
import { asyncComputed } from "@vueuse/core";
import { PlayCircleIcon } from "lucide-vue-next";

const props = defineProps<{
  scenario: Scenario;
  episodeId: string;
  episode: Scenario["episodes"][string];
}>();

const episodeImageUrl = asyncComputed(() =>
  props.episode.imagePath
    ? props.scenario.resourceUrl(props.episode.imagePath)
    : null,
);
</script>

<template lang="pug">
.group.flex.flex-col.divide-y
  .relative.aspect-video.w-full.overflow-hidden
    .absolute.z-10.flex.h-full.w-full.items-center.justify-center.transition(
      class="group-hover:bg-black/30"
    )
      PlayCircleIcon.text-white.opacity-0.transition(
        :size="32"
        class="group-hover:opacity-100 group-hover:brightness-105"
      )
    img.w-full.object-cover.transition(
      v-if="episodeImageUrl"
      :src="episodeImageUrl"
      class="group-hover:scale-105"
    )
    Placeholder.w-full(v-else)
  .flex.justify-center.px-2.py-1
    span.text-center.font-semibold.leading-tight {{ episode.name }}
</template>

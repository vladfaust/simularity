<script setup lang="ts">
import Placeholder from "@/components/Placeholder.vue";
import { Scenario } from "@/lib/simulation/scenario";
import { asyncComputed } from "@vueuse/core";

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
.flex.flex-col.divide-y
  img.aspect-video.w-full.object-cover(
    v-if="episodeImageUrl"
    :src="episodeImageUrl"
  )
  Placeholder.aspect-video.w-full(v-else)
  .flex.justify-center.px-2.py-1
    span.text-center.font-semibold.leading-tight {{ episode.name }}
</template>

<script setup lang="ts">
import { type Scenario } from "@/lib/simulation/scenario";
import { asyncComputed } from "@vueuse/core";
import { computed } from "vue";
import Placeholder from "./Placeholder.vue";

const props = defineProps<{
  scenario: Scenario;
  episodeId: string;
  selected?: boolean;
}>();

const episode = computed(
  () => props.scenario.content.episodes[props.episodeId],
);

const episodeImageUrl = asyncComputed(() =>
  episode.value.imagePath
    ? props.scenario.resourceUrl(episode.value.imagePath)
    : null,
);
</script>

<template lang="pug">
.group.flex.flex-col.divide-y.overflow-hidden
  .aspect-video.w-full.overflow-hidden
    img.w-full.object-cover.transition(
      v-if="episodeImageUrl"
      :src="episodeImageUrl"
      class="group-hover:brightness-105"
    )
    Placeholder.w-full(v-else)
</template>

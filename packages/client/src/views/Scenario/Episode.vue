<script setup lang="ts">
import Placeholder from "@/components/Placeholder.vue";
import { type Scenario } from "@/lib/simulation/scenario";
import { asyncComputed } from "@vueuse/core";
import { computed } from "vue";

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
  .flex.justify-center.p-2
    span.text-center.font-semibold.leading-tight.tracking-wide(
      :class="{ 'text-primary-500': selected }"
    ) {{ episode.name }}
</template>

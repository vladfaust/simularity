<script setup lang="ts">
import { RemoteScenario, type LocalScenario } from "@/lib/scenario";
import { asyncComputed } from "@vueuse/core";
import { computed } from "vue";
import Placeholder from "./Placeholder.vue";

const props = defineProps<{
  scenario: LocalScenario | RemoteScenario;
  episodeId: string;
  selected?: boolean;
}>();

const episode = computed(() => props.scenario.episodes[props.episodeId]);

const episodeImageUrl = asyncComputed(() =>
  episode.value.image
    ? props.scenario.resourceUrl(episode.value.image.path)
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

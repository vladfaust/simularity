<script setup lang="ts">
import Placeholder from "@/components/Placeholder.vue";
import { remoteScenarioAssetUrl } from "@/lib/logic/scenarios";
import { useRemoteScenarioQuery } from "@/lib/queries";
import { asyncComputed } from "@vueuse/core";
import { computed } from "vue";

const { scenarioId, episodeId } = defineProps<{
  scenarioId: string;
  episodeId: string;
  selected?: boolean;
}>();

const { data: scenario } = useRemoteScenarioQuery(scenarioId);
const episode = computed(() => scenario.value?.episodes[episodeId]);

const episodeImageUrl = asyncComputed(() =>
  episode.value?.image
    ? remoteScenarioAssetUrl(
        scenarioId,
        scenario.value!.version,
        episode.value.image.path,
      )
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

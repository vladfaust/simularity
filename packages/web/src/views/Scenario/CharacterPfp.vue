<script setup lang="ts">
import Placeholder from "@/components/Placeholder.vue";
import { remoteScenarioAssetUrl } from "@/lib/logic/scenarios";
import { useRemoteScenarioQuery } from "@/lib/queries";
import { asyncComputed } from "@vueuse/core";
import { computed } from "vue";

const { scenarioId, characterId } = defineProps<{
  scenarioId: string;
  characterId: string;
}>();

const { data: scenario } = useRemoteScenarioQuery(scenarioId);
const character = computed(() => scenario.value?.characters[characterId]);

const pfpUrl = asyncComputed(() =>
  character.value?.pfp
    ? remoteScenarioAssetUrl(
        scenarioId,
        scenario.value!.version,
        character.value.pfp.path,
      )
    : null,
);
</script>

<template lang="pug">
img.select-none.object-cover(v-if="pfpUrl" :src="pfpUrl")
Placeholder(v-else)
</template>

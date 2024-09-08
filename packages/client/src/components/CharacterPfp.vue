<script setup lang="ts">
import Placeholder from "@/components/Placeholder.vue";
import { type Scenario } from "@/lib/simulation";
import { asyncComputed } from "@vueuse/core";

const { scenario, character } = defineProps<{
  scenario: Scenario;
  character: Scenario["content"]["characters"][string];
}>();

const pfpUrl = asyncComputed(() =>
  character.pfpPath ? scenario.resourceUrl(character.pfpPath) : undefined,
);
</script>

<template lang="pug">
img.select-none.object-cover(v-if="pfpUrl" :src="pfpUrl")
Placeholder(v-else)
</template>

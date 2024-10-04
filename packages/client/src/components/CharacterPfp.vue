<script setup lang="ts">
import Placeholder from "@/components/Placeholder.vue";
import type { Scenario } from "@/lib/scenario";
import { asyncComputed } from "@vueuse/core";

const { scenario, character } = defineProps<{
  scenario: Scenario;
  character: Scenario["characters"][string];
}>();

const pfpUrl = asyncComputed(() =>
  character.pfp ? scenario.resourceUrl(character.pfp.path) : undefined,
);
</script>

<template lang="pug">
img.select-none.object-cover(v-if="pfpUrl" :src="pfpUrl")
Placeholder(v-else)
</template>

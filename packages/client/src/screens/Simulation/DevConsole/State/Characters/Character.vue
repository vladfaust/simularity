<script setup lang="ts">
import Placeholder from "@/components/Placeholder.vue";
import { Scenario } from "@/lib/simulation";
import { asyncComputed } from "@vueuse/core";

const { scenario, character } = defineProps<{
  scenario: Scenario;
  character: Scenario["characters"][string];
  isSelected?: boolean;
  isOnStage?: boolean;
}>();

const pfpUrl = asyncComputed(() =>
  character.pfpPath ? scenario.resourceUrl(character.pfpPath) : undefined,
);
</script>

<template lang="pug">
.relative.flex.aspect-square.flex-col.overflow-hidden(
  :class="{ 'border-white': !isSelected, 'border-primary-500': isSelected }"
)
  img.h-full.w-full.object-cover(v-if="pfpUrl" :src="pfpUrl")
  Placeholder(v-else)
</template>

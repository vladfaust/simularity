<script setup lang="ts">
import type { ImmersiveScenario } from "@/lib/simulation/scenario";
import { asyncComputed } from "@vueuse/core";

const { scenario, scene } = defineProps<{
  scenario: ImmersiveScenario;
  scene: ImmersiveScenario["content"]["scenes"][string];
  selected?: boolean;
}>();

const bgUrl = asyncComputed(() => scenario.resourceUrl(scene.bg));
</script>

<template lang="pug">
.flex.flex-col(
  :class="{ 'border-white': !selected, 'border-primary-500': selected }"
)
  img.aspect-video.object-cover(v-if="bgUrl" :src="bgUrl")
</template>

<script setup lang="ts">
import type { LocalImmersiveScenario } from "@/lib/scenario";
import { asyncComputed } from "@vueuse/core";

const { scenario, scene } = defineProps<{
  scenario: LocalImmersiveScenario;
  scene: LocalImmersiveScenario["content"]["scenes"][string];
  selected?: boolean;
}>();

const bgUrl = asyncComputed(() => scenario.resourceUrl(scene.bg.path));
</script>

<template lang="pug">
.flex.flex-col(
  :class="{ 'border-white': !selected, 'border-primary-500': selected }"
)
  img.aspect-video.object-cover(v-if="bgUrl" :src="bgUrl")
</template>

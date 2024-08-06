<script setup lang="ts">
import { Scenario, Simulation } from "@/lib/simulation";
import { asyncComputed } from "@vueuse/core";
import { computed } from "vue";

const { simulation, sceneId, scene } = defineProps<{
  simulation: Simulation;
  sceneId: string;
  scene: Scenario["scenes"][string];
}>();

const bgUrl = asyncComputed(() => simulation.scenario.resourceUrl(scene.bg));
const isSet = computed(() => simulation.state.stage.value.sceneId == sceneId);

function set() {
  simulation.state.setScene(sceneId);
}
</script>

<template lang="pug">
.flex.h-full.flex-col.items-center.gap-2.overflow-y-auto
  img.aspect-video.rounded-lg.object-cover.shadow-lg(v-if="bgUrl" :src="bgUrl")
  span.mt-1.text-center.text-lg.font-semibold.leading-tight {{ scene.name }}
  button.btn.btn-md.btn-primary.btn-pressable.rounded(
    :disabled="isSet"
    @click="set"
  ) Set as scene
  p.text-center.font-mono.text-sm.leading-tight {{ scene.prompt }}
</template>

<script setup lang="ts">
import type { LocalImmersiveScenario } from "@/lib/scenario";
import { Simulation } from "@/lib/simulation";
import { appLocale } from "@/lib/storage";
import { translationWithFallback } from "@/logic/i18n";
import { asyncComputed } from "@vueuse/core";
import { Grid2X2Icon } from "lucide-vue-next";
import { computed } from "vue";
import OnStageMark from "../OnStageMark.vue";

const { simulation, sceneId, scene } = defineProps<{
  simulation: Simulation;
  sceneId: string;
  scene: LocalImmersiveScenario["content"]["scenes"][string];
}>();

const bgUrl = asyncComputed(() =>
  simulation.scenario.resourceUrl(scene.bg.path),
);
const isSet = computed(() => simulation.state!.stage.value.sceneId == sceneId);

function set() {
  simulation.state!.setScene(sceneId);
}
</script>

<template lang="pug">
.flex.h-full.flex-col.items-center.gap-2.overflow-y-auto
  .relative
    img.aspect-video.rounded-lg.border-2.border-white.object-cover.shadow-lg(
      v-if="bgUrl"
      :src="bgUrl"
    )
    OnStageMark.absolute.-bottom-1.-right-1.shadow-lg(v-if="isSet")
  span.mt-1.text-center.font-semibold.leading-tight {{ translationWithFallback(scene.name, appLocale) }}
  button.btn.btn-md.btn-primary.btn-pressable.rounded(
    :disabled="isSet"
    @click="set"
    title="Set scene"
  )
    Grid2X2Icon(:size="16" :stroke-width="3")
    | Set
  p.text-center.font-mono.text-sm.leading-tight {{ scene.prompt }}
</template>

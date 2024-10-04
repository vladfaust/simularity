<script setup lang="ts">
import Placeholder from "@/components/Placeholder.vue";
import TransitionImage from "@/components/TransitionImage.vue";
import { selectedScenarioId } from "@/lib/storage";
import { useLocalScenarioQuery, useRemoteScenarioQuery } from "@/queries";
import { asyncComputed, watchImmediate } from "@vueuse/core";
import { computed, ref } from "vue";
import MenuOverlay from "./MenuOverlay.vue";

const { data: localScenario } = useLocalScenarioQuery(selectedScenarioId);
const { data: remoteScenario } = useRemoteScenarioQuery(selectedScenarioId);
const scenario = computed(() => localScenario.value ?? remoteScenario.value);
const imgLoaded = ref(false);

const backgroundImageUrl = asyncComputed(() =>
  scenario.value?.getCoverImageUrl(),
);

watchImmediate(scenario, () => {
  imgLoaded.value = false;
});
</script>

<template lang="pug">
.relative.flex.h-screen.w-full
  MenuOverlay.z-10.m-4.w-full.rounded-lg.shadow-lg

  TransitionImage.pointer-events-none.absolute.h-full.w-full.object-cover.blur.brightness-75(
    v-if="backgroundImageUrl"
    name="fade"
    :src="backgroundImageUrl"
    alt="Background"
  )
  Placeholder.absolute.h-full.w-full.bg-neutral-200(v-else)
</template>

<style lang="postcss" scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s ease-in;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

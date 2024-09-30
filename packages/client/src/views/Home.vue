<script setup lang="ts">
import TransitionImage from "@/components/TransitionImage.vue";
import { selectedScenarioId } from "@/lib/storage";
import { useScenarioQuery } from "@/queries";
import { asyncComputed, watchImmediate } from "@vueuse/core";
import { ref } from "vue";
import MenuOverlay from "./MenuOverlay.vue";

const { data: scenario } = useScenarioQuery(selectedScenarioId);
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

  TransitionImage.pointer-events-none.absolute.h-full.w-full.object-cover.brightness-90(
    v-if="backgroundImageUrl"
    name="fade"
    :src="backgroundImageUrl"
    alt="Background"
  )
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

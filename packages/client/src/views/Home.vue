<script setup lang="ts">
import { selectedScenarioId } from "@/lib/storage";
import { useScenarioQuery } from "@/queries";
import { asyncComputed } from "@vueuse/core";
import MenuOverlay from "./MenuOverlay.vue";

const { data: scenario } = useScenarioQuery(selectedScenarioId);

const backgroundImageUrl = asyncComputed(() =>
  scenario.value?.getCoverImageUrl(),
);
</script>

<template lang="pug">
.relative.flex.h-screen.w-full
  MenuOverlay.z-10.m-3.w-full.rounded-lg.shadow-lg

  img.pointer-events-none.absolute.h-full.w-full.object-cover.brightness-90(
    v-if="backgroundImageUrl"
    :src="backgroundImageUrl"
    alt="Background"
  )
</template>

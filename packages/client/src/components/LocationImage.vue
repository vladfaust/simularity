<script setup lang="ts">
import { type Scenario } from "@/lib/simulation";
import { computed } from "vue";

const props = defineProps<{
  assetBaseUrl: URL;
  location: Scenario["locations"][0];
  sceneId?: string;
}>();

const scene = computed(() =>
  props.sceneId
    ? props.location.scenes.find((s) => s.id === props.sceneId)!
    : props.location.scenes[0],
);

const sceneSrc = computed(() => props.assetBaseUrl + scene.value.bg);
</script>

<template lang="pug">
.relative
  img.absolute.h-full.w-full.object-cover(:src="sceneSrc")
</template>

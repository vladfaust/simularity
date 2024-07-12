<script setup lang="ts">
import { type Scenario } from "@/lib/simulation";
import { computed } from "vue";

const props = defineProps<{
  assetBaseUrl: URL;
  character: Scenario["characters"][0];
  outfitId?: string;
  expressionId?: string;
}>();

const expression = computed(() =>
  props.expressionId
    ? props.character.expressions.find((e) => e.id === props.expressionId)!
    : props.character.expressions[0],
);

const expressionSrc = computed(
  () => props.assetBaseUrl + expression.value.file,
);

const bodyId = computed(() => expression.value.bodyId);
const bodySrc = computed(
  () => props.assetBaseUrl + props.character.bodies[bodyId.value],
);

const outfit = computed(() =>
  props.outfitId
    ? props.character.outfits.find((e) => e.id === props.outfitId)!
    : props.character.outfits[0],
);
const outfitSrc = computed(
  () => props.assetBaseUrl + outfit.value.files[bodyId.value],
);
</script>

<template lang="pug">
//- TODO: Render to a canvas element instead of using img tags.
.relative.select-none
  img.absolute.h-full.w-full.object-cover(:src="bodySrc")
  img.absolute.h-full.w-full.object-cover(:src="outfitSrc")
  img.absolute.h-full.w-full.object-cover(:src="expressionSrc")
</template>

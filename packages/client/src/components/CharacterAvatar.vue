<script setup lang="ts">
import { type Scenario } from "@/lib/simulation";
import { asyncComputed } from "@vueuse/core";
import { computed } from "vue";

const props = defineProps<{
  scenario: Scenario;
  characterId: string;
  outfitId?: string;
  expressionId?: string;
}>();

const character = computed(() =>
  props.scenario.ensureCharacter(props.characterId),
);

const expressionId = computed(
  () =>
    props.expressionId || props.scenario.defaultExpressionId(props.characterId),
);

const outfitId = computed(
  () => props.outfitId || props.scenario.defaultOutfitId(props.characterId),
);

const expressionAvatar = computed(
  () => character.value.layeredSpritesAvatar.expressions[expressionId.value],
);

const bodyId = computed(() => expressionAvatar.value.bodyId);

const bodySrc = asyncComputed(() =>
  props.scenario.resourceUrl(
    character.value.layeredSpritesAvatar.bodies[bodyId.value],
  ),
);

const expressionSrc = asyncComputed(() =>
  props.scenario.resourceUrl(expressionAvatar.value.file),
);

const outfitSrc = asyncComputed(() =>
  props.scenario.resourceUrl(
    character.value.layeredSpritesAvatar.outfits[outfitId.value].files[
      bodyId.value
    ],
  ),
);
</script>

<template lang="pug">
//- TODO: Render to a canvas element instead of using img tags.
.relative.select-none
  img.absolute.h-full.w-full.object-cover(:src="bodySrc")
  img.absolute.h-full.w-full.object-cover(:src="outfitSrc")
  img.absolute.h-full.w-full.object-cover(:src="expressionSrc")
</template>

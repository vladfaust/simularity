<script setup lang="ts">
import Placeholder from "@/components/Placeholder.vue";
import { Scenario } from "@/lib/simulation/scenario";
import { asyncComputed } from "@vueuse/core";

const props = defineProps<{
  scenario: Scenario;
  characterId: string;
  character: Scenario["characters"][string];
}>();

const characterPfpUrl = asyncComputed(() =>
  props.scenario.getCharacterPfpUrl(props.characterId),
);
</script>

<template lang="pug">
.flex.flex-col.divide-y
  img.aspect-square.w-full.object-cover(
    v-if="characterPfpUrl"
    :src="characterPfpUrl"
  )
  Placeholder.aspect-square.w-full(v-else)
  .flex.justify-center.px-2.py-1
    span.text-center.font-semibold.leading-tight(
      :style="{ color: character.color }"
    ) {{ character.name }}
</template>

<style lang="scss" scoped></style>

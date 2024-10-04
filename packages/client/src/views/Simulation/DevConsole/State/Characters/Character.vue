<script setup lang="ts">
import CharacterPfp from "@/components/CharacterPfp.vue";
import type { LocalImmersiveScenario } from "@/lib/scenario";

const { scenario, character } = defineProps<{
  scenario: LocalImmersiveScenario;
  character: LocalImmersiveScenario["content"]["characters"][string];
  isSelected?: boolean;
  isOnStage?: boolean;
}>();
</script>

<template lang="pug">
.relative.flex.aspect-square.flex-col.overflow-hidden(
  :class="{ 'border-white': !isSelected, 'border-primary-500': isSelected }"
)
  CharacterPfp(:scenario :character)
</template>

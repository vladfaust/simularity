<script setup lang="ts">
import CharacterPfp from "@/components/CharacterPfp.vue";
import { Simulation } from "@/lib/simulation";
import { NARRATOR } from "@/lib/simulation/agents/writer";
import { BotIcon } from "lucide-vue-next";

defineProps<{
  simulation: Simulation;
  enabledCharacterIds: string[];
}>();

const emit = defineEmits<{
  (event: "switchEnabledCharacter", characterId: string): void;
  (event: "enableOnlyCharacter", characterId: string): void;
}>();

function onCharacterClick(event: MouseEvent, characterId: string) {
  if (event.metaKey) {
    emit("enableOnlyCharacter", characterId);
  } else {
    emit("switchEnabledCharacter", characterId);
  }
}
</script>

<template lang="pug">
.flex.justify-center
  .flex.h-full.justify-center.gap-1.rounded-lg.p-2(class="bg-black/10")
    //- Narrator
    ._inference-settings-character.grid.h-full.place-items-center(
      :class="{ _enabled: enabledCharacterIds.includes(NARRATOR) }"
      title="Narrator"
      @click="onCharacterClick($event, NARRATOR)"
    )
      BotIcon.text-secondary-500(:size="28" :stroke-width="1.5")

    //- Other characters.
    CharacterPfp._inference-settings-character(
      v-for="[characterId, character] in Object.entries(simulation.scenario.characters)"
      :key="characterId"
      :scenario="simulation.scenario"
      :character
      :class="{ _enabled: enabledCharacterIds.includes(characterId) }"
      :title="character.name"
      @click="onCharacterClick($event, characterId)"
    )
</template>

<style lang="scss" scoped>
._inference-settings-character {
  @apply aspect-square h-12 cursor-pointer rounded-lg bg-white shadow-lg transition pressable;

  &:not(._enabled) {
    @apply border-2 opacity-90 grayscale;

    &:hover {
      @apply opacity-100 filter-none;
    }
  }

  &._enabled {
    @apply border-ai-500 border-2;
  }
}
</style>

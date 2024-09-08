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
    .relative
      ._index.-bottom-1.-left-1.z-10.h-4.w-4.rounded.shadow-lg
        span.text-xs 1
      ._inference-settings-character.grid.h-full.select-none.place-items-center(
        :class="{ _enabled: enabledCharacterIds.includes(NARRATOR) }"
        title="Narrator (1) (click to toggle)"
        @click="onCharacterClick($event, NARRATOR)"
      )
        BotIcon.text-secondary-500(:size="28" :stroke-width="1.5")

    //- Other characters.
    .relative(
      v-for="([characterId, character], i) in Object.entries(simulation.scenario.content.characters)"
    )
      ._index.-bottom-1.-left-1.z-10.h-4.w-4.rounded.shadow-lg
        span.text-xs {{ i + 2 }}
      CharacterPfp._inference-settings-character(
        :key="characterId"
        :scenario="simulation.scenario"
        :character
        :class="{ _enabled: enabledCharacterIds.includes(characterId) }"
        :title="character.name"
        @click="onCharacterClick($event, characterId)"
      )
</template>

<style lang="scss" scoped>
._index {
  @apply absolute flex items-center justify-center border bg-white;

  span {
    @apply leading-none text-gray-500;
  }
}

._inference-settings-character {
  @apply aspect-square h-12 cursor-pointer rounded-lg bg-white shadow-lg transition pressable;

  &:not(._enabled) {
    @apply border-2 opacity-90 grayscale;

    &:hover {
      @apply opacity-100 filter-none;
    }
  }

  &._enabled {
    @apply border-2 border-ai-500;
  }
}
</style>

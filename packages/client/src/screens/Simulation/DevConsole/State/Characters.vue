<script setup lang="ts">
import { Simulation } from "@/lib/simulation";
import { CheckSquare2Icon, CircleOffIcon, DramaIcon } from "lucide-vue-next";
import { ref } from "vue";
import Character from "./Characters/Character.vue";
import SelectedCharacter from "./Characters/SelectedCharacter.vue";

const { simulation } = defineProps<{
  simulation: Simulation;
}>();

const selectedCharacterId = ref<string | undefined>(
  // Find the last added character that is not the default character.
  simulation.state.stage.value.characters
    .filter((c) => c.id !== simulation.scenario.defaultCharacterId)
    .at(-1)?.id,
);
</script>

<template lang="pug">
.grid.h-full.grid-cols-3.overflow-y-hidden.rounded-lg.bg-white
  .flex.h-full.flex-col.overflow-y-hidden
    //- Header.
    .flex.w-full.gap-2.border-b.p-3
      .flex.items-center.gap-1
        DramaIcon(:size="24")
        h1.text-lg.font-semibold.tracking-wide Characters
      .flex.w-full
        input.w-full.grow.rounded-lg.bg-neutral-100.px-2(
          type="text"
          placeholder="Filter..."
        )

    //- Characters list.
    .h-full.overflow-y-auto(@click="selectedCharacterId = undefined")
      ul.grid.grid-cols-3.gap-2.p-3
        li.relative.h-max.cursor-pointer.drop-shadow-lg.transition-transform.pressable-sm(
          v-for="[characterId, character] in Object.entries(simulation.scenario.characters).slice(1)"
          :key="characterId"
        )
          Character.rounded-lg.border-2(
            :scenario="simulation.scenario"
            :character
            :is-selected="selectedCharacterId === characterId"
            @click.stop="selectedCharacterId = characterId"
          )
          .absolute.-bottom-1.-right-1.rounded-lg.bg-primary-500.p-1.shadow-lg(
            v-if="simulation.state.stage.value.characters.find((c) => c.id === characterId)"
          )
            CheckSquare2Icon.text-white(:size="20")

  //- Selected character.
  SelectedCharacter.col-span-2.border-l(
    v-if="selectedCharacterId"
    :simulation
    :character-id="selectedCharacterId"
    :character="simulation.scenario.characters[selectedCharacterId]"
    :key="selectedCharacterId"
  )
  .col-span-2.flex.flex-col.items-center.justify-center.border-l.opacity-50(
    v-else
  )
    CircleOffIcon(:size="32" :stroke-width="1")
    h1.font-medium No character selected
</template>

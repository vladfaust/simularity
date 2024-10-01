<script setup lang="ts">
import { Simulation } from "@/lib/simulation";
import type { ImmersiveScenario } from "@/lib/scenario";
import { nonNullable } from "@/lib/utils";
import { useSessionStorage } from "@vueuse/core";
import { CircleOffIcon, DramaIcon } from "lucide-vue-next";
import { computed } from "vue";
import Character from "./Characters/Character.vue";
import SelectedCharacter from "./Characters/SelectedCharacter.vue";
import OnStageMark from "./OnStageMark.vue";

const { simulation } = defineProps<{
  simulation: Simulation;
}>();

const scenario = computed(
  () =>
    // Because DevConsole is only shown in immersive mode.
    simulation.scenario as ImmersiveScenario,
);

const selectedCharacterId = useSessionStorage<string | undefined>(
  `simulation:${simulation.id}:stateLatestSelectedCharacterId`,
  undefined,
);
</script>

<template lang="pug">
.grid.h-full.grid-cols-3.overflow-y-hidden.rounded-lg.bg-white
  .flex.h-full.flex-col.overflow-y-hidden
    //- Header.
    .flex.w-full.gap-2.border-b.p-3
      .flex.items-center.gap-1
        DramaIcon(:size="20")
        h1.font-semibold.tracking-wide Characters

    //- Characters list.
    .h-full.overflow-y-auto(@click="selectedCharacterId = undefined")
      ul.grid.gap-2.p-3(class="max-lg:grid-cols-2 lg:grid-cols-3")
        li.relative.h-max.cursor-pointer.drop-shadow-lg.transition-transform.pressable-sm(
          v-for="[characterId, character] in Object.entries(scenario.content.characters).slice(1)"
          :key="characterId"
        )
          Character.rounded-lg.border-2(
            :scenario
            :character
            :is-selected="selectedCharacterId === characterId"
            @click.stop="selectedCharacterId = characterId"
          )
          OnStageMark.absolute.-bottom-1.-right-1.shadow-lg(
            v-if="nonNullable(simulation.state).stage.value.characters.find((c) => c.id === characterId)"
          )

  //- Selected character.
  SelectedCharacter.col-span-2.border-l(
    v-if="selectedCharacterId"
    :simulation
    :character-id="selectedCharacterId"
    :character="scenario.content.characters[selectedCharacterId]"
    :key="selectedCharacterId"
  )
  .col-span-2.flex.flex-col.items-center.justify-center.border-l.opacity-50(
    v-else
  )
    CircleOffIcon(:size="32" :stroke-width="1")
    h1.font-medium No character selected
</template>

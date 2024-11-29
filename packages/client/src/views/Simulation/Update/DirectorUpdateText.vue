<script setup lang="ts">
import type { LocalImmersiveScenario } from "@/lib/scenario";
import type { Simulation } from "@/lib/simulation";
import type { StateCommand } from "@/lib/simulation/state";
import { appLocale } from "@/lib/storage";
import { translationWithFallback } from "@/logic/i18n";
import { computed } from "vue";

const { simulation, commands } = defineProps<{
  simulation: Simulation;
  commands: StateCommand[];
}>();

const commandsText = computed(() => {
  const formattedCommands = commands
    .map((command) => {
      switch (command.name) {
        case "setScene": {
          const scene = (
            simulation.scenario as LocalImmersiveScenario
          ).ensureScene(command.args.sceneId);

          return `Scene changes to <span class="_directorUpdate-entityId">${translationWithFallback(
            scene.name,
            appLocale.value,
          )}</span>`;
        }

        case "addCharacter": {
          const character = (
            simulation.scenario as LocalImmersiveScenario
          ).ensureCharacter(command.args.characterId);

          return `<span class="_directorUpdate-entityId">${translationWithFallback(
            character.name,
            appLocale.value,
          )}</span> enters the stage`;
        }

        case "removeCharacter": {
          const character = (
            simulation.scenario as LocalImmersiveScenario
          ).ensureCharacter(command.args.characterId);

          return `<span class="_directorUpdate-entityId">${translationWithFallback(
            character.name,
            appLocale.value,
          )}</span> leaves the stage`;
        }

        default:
          return "";
      }
    })
    .filter(Boolean);

  if (formattedCommands.length) {
    return formattedCommands.join(". ") + ". ";
  } else {
    return "";
  }
});
</script>

<template lang="pug">
span(v-html="commandsText")
</template>

<style lang="postcss">
._directorUpdate-entityId {
  @apply font-semibold;
}
</style>

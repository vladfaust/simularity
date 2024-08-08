<script setup lang="ts">
import CharacterPfp from "@/components/CharacterPfp.vue";
import Agent from "./AiSettingsModal/Agent.vue";
import { Simulation } from "@/lib/simulation";
import { NARRATOR } from "@/lib/simulation/agents/writer";
import {
  Dialog,
  DialogPanel,
  TransitionChild,
  TransitionRoot,
} from "@headlessui/vue";
import { BrainCircuitIcon, FeatherIcon, XIcon } from "lucide-vue-next";

defineProps<{
  open: boolean;
  simulation: Simulation;
  enabledCharacterIds: string[];
}>();

const emit = defineEmits<{
  (event: "close"): void;
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
Dialog.relative.z-50.w-screen.overflow-hidden(
  :open="open"
  @close="emit('close')"
  :unmount="false"
  :static="true"
)
  TransitionRoot(:show="open" as="template")
    TransitionChild.fixed.inset-0.grid.place-items-center.overflow-hidden.p-4.backdrop-blur(
      class="bg-black/30"
      enter="duration-200 ease-out"
      enter-from="opacity-0"
      enter-to="opacity-100"
      leave="duration-200 ease-in"
      leave-from="opacity-100"
      leave-to="opacity-0"
    )
      DialogPanel.flex.max-h-full.w-full.max-w-lg.flex-col.overflow-y-hidden.rounded-lg.bg-white.shadow-lg
        .flex.items-center.justify-between.gap-2.border-b.p-3
          h1.flex.shrink-0.items-center.gap-1
            BrainCircuitIcon.inline-block(:size="20")
            span.text-lg.font-semibold.leading-tight.tracking-wide AI Settings
          .h-0.w-full.shrink.border-b
          button.btn-pressable.btn-neutral.btn.aspect-square.rounded.p-1(
            @click="emit('close')"
          )
            XIcon(:size="20")

        .flex.h-full.flex-col.gap-2.overflow-y-auto.p-3
          //- Enabled characters.
          .flex.items-center.gap-2
            h2.shrink-0.font-semibold.leading-tight.tracking-wide Enabled characters
            .h-0.w-full.border-t
            span.shrink-0 {{ enabledCharacterIds.length }}/{{ Object.keys(simulation.scenario.characters).length + 1 }}

          .grid.gap-1(class="max-xs:grid-cols-4 xs:grid-cols-8")
            ._inference-settings-character.grid.h-full.place-items-center(
              :class="{ grayscale: !enabledCharacterIds.includes(NARRATOR), 'border-primary-500': enabledCharacterIds.includes(NARRATOR) }"
              title="Narrator"
              @click="onCharacterClick($event, NARRATOR)"
            )
              FeatherIcon.text-primary-500(:size="28" :stroke-width="1.5")
            CharacterPfp._inference-settings-character(
              v-for="[characterId, character] in Object.entries(simulation.scenario.characters)"
              :key="characterId"
              :scenario="simulation.scenario"
              :character
              :class="{ grayscale: !enabledCharacterIds.includes(characterId), 'border-primary-500': enabledCharacterIds.includes(characterId) }"
              :title="character.name"
              @click="onCharacterClick($event, characterId)"
            )

          //- Writer agent.
          Agent(
            :agent-id="'writer'"
            :gpt="simulation.writer.value?.gpt"
            name="Writer"
          )

          //- Director agent.
          Agent(
            :agent-id="'director'"
            :gpt="simulation.director.value?.gpt"
            name="Director"
          )
</template>

<style lang="scss" scoped>
._inference-settings-character {
  @apply aspect-square cursor-pointer rounded-lg border transition-transform pressable;
}
</style>

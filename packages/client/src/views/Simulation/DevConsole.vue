<script setup lang="ts">
import { Simulation } from "@/lib/simulation";
import {
  Dialog,
  DialogPanel,
  TransitionChild,
  TransitionRoot,
} from "@headlessui/vue";
import DirectorUpdate from "./DevConsole/DirectorUpdate.vue";
import StateCharacters from "./DevConsole/State/Characters.vue";
import StateScenes from "./DevConsole/State/Scenes.vue";
import UpdateVue from "./Update.vue";

defineProps<{
  open: boolean;
  simulation: Simulation;
}>();

const emit = defineEmits<{
  (event: "close"): void;
}>();

function onRootClick(e: Event) {
  if (e.target !== e.currentTarget) return;
  emit("close");
}
</script>

<template lang="pug">
Dialog.relative.z-50(
  :open="open"
  @close="emit('close')"
  :unmount="false"
  :static="true"
)
  TransitionRoot(:show="open" as="template")
    TransitionChild.fixed.inset-0.h-full.w-full.overflow-y-hidden.backdrop-blur(
      enter="duration-200 ease-out"
      enter-from="opacity-0"
      enter-to="opacity-100"
      leave="duration-200 ease-in"
      leave-from="opacity-100"
      leave-to="opacity-0"
      class="bg-black/50"
    )
      DialogPanel.grid.h-full.w-full.grid-cols-3.flex-col.gap-3.overflow-y-hidden.p-3
        .flex.h-full.flex-col.gap-3.overflow-y-hidden(@click="onRootClick")
          //- Writer update.
          .flex.flex-col.gap-2.rounded-xl.p-3(class="bg-white/20")
            UpdateVue(
              v-if="simulation.currentUpdate.value"
              :simulation
              :update="simulation.currentUpdate.value"
              :can-regenerate="false"
              :can-edit="false"
              :is-single="true"
              :show-variant-navigation="false"
              :hide-tts="true"
              :hide-preference="true"
              :update-index="simulation.currentUpdateIndex.value"
              :in-dev-console="true"
            )

          //- Director update.
          .flex.max-h-full.flex-col.gap-2.overflow-y-hidden.rounded-xl.p-3(
            class="bg-white/20"
            v-if="simulation.currentUpdate.value"
          )
            DirectorUpdate.h-full.overflow-y-hidden(
              :simulation
              :update="simulation.currentUpdate.value"
              :in-dev-console="true"
            )

        //- State.
        .col-span-2.grid.h-full.grid-rows-2.flex-col.gap-2.overflow-y-hidden.rounded-xl.p-3(
          class="bg-white/20"
        )
          StateScenes.shadow-lg(:simulation)
          StateCharacters.shadow-lg(:simulation)
</template>

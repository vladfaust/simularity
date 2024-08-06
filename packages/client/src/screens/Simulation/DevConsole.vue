<script setup lang="ts">
import { Simulation } from "@/lib/simulation";
import {
  Dialog,
  DialogPanel,
  TransitionChild,
  TransitionRoot,
} from "@headlessui/vue";
import UpdateVue from "./Update.vue";
import StateScenes from "./DevConsole/State/Scenes.vue";
import StateCharacters from "./DevConsole/State/Characters.vue";

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
        .flex.flex-col.gap-3(@click="onRootClick")
          //- Writer update.
          .flex.flex-col.gap-2.rounded-xl.p-3(class="bg-white/20")
            h1.font-medium.leading-tight.tracking-wide.text-white Writer update
            UpdateVue(
              v-if="simulation.currentUpdate.value"
              :simulation
              :update="simulation.currentUpdate.value"
              :can-regenerate="false"
              :can-edit="false"
              :is-single="true"
              :show-variant-navigation="false"
              :update-index="simulation.currentUpdateIndex.value"
            )

          //- Director update.
          .flex.flex-col.gap-2.rounded-xl.p-3(class="bg-white/20")
            h1.font-medium.leading-tight.tracking-wide.text-white Director update

        //- State.
        .col-span-2.grid.h-full.grid-rows-2.flex-col.gap-2.overflow-y-hidden.rounded-xl.p-3(
          class="bg-white/20"
        )
          StateScenes.shadow-lg(:simulation)
          StateCharacters.shadow-lg(:simulation)
</template>

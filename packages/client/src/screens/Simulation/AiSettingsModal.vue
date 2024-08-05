<script setup lang="ts">
import Agent from "./AiSettingsModal/Agent.vue";
import { Simulation } from "@/lib/simulation";
import {
  Dialog,
  DialogPanel,
  TransitionChild,
  TransitionRoot,
} from "@headlessui/vue";
import { BrainCircuitIcon, XIcon } from "lucide-vue-next";

defineProps<{
  open: boolean;
  simulation: Simulation;
}>();

const emit = defineEmits<{
  (event: "close"): void;
}>();
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
      DialogPanel.flex.w-full.max-w-lg.flex-col.overflow-y-auto.rounded-lg.bg-white.shadow-lg
        .flex.items-center.justify-between.gap-2.border-b.p-3
          h1.flex.shrink-0.items-center.gap-1
            BrainCircuitIcon.inline-block(:size="20")
            span.text-lg.font-semibold.leading-tight.tracking-wide AI Settings
          .h-0.w-full.shrink.border-b
          button.btn-pressable.btn-neutral.btn.aspect-square.rounded.p-1(
            @click="emit('close')"
          )
            XIcon(:size="20")
        .flex.flex-col.gap-2.p-3
          Agent(
            :agent-id="'writer'"
            :gpt="simulation.writer.value?.gpt"
            name="Writer"
          )
          Agent(
            :agent-id="'director'"
            :gpt="simulation.director.value?.gpt"
            name="Director"
          )
</template>

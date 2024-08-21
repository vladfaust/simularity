<script setup lang="ts">
import { Simulation } from "@/lib/simulation";
import * as storage from "@/lib/storage";
import { clone, tap } from "@/lib/utils";
import {
  Dialog,
  DialogPanel,
  TransitionChild,
  TransitionRoot,
} from "@headlessui/vue";
import { BrainCircuitIcon, XIcon } from "lucide-vue-next";
import { ref } from "vue";
import LlmAgent from "./AiSettingsModal/LlmAgent.vue";

defineProps<{
  open: boolean;
  simulation: Simulation;
}>();

const emit = defineEmits<{
  (event: "close"): void;
}>();

const writerConfig = storage.llm.useDriverConfig("writer");
const tempWriterConfig = ref(tap(writerConfig.value, clone) ?? null);

const directorConfig = storage.llm.useDriverConfig("director");
const tempDirectorConfig = ref(tap(directorConfig.value, clone) ?? null);

function onClose() {
  writerConfig.value = tempWriterConfig.value;
  directorConfig.value = tempDirectorConfig.value;

  emit("close");
}
</script>

<template lang="pug">
Dialog.relative.z-50.w-screen.overflow-hidden(
  :open="open"
  @close="onClose"
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
      DialogPanel.flex.max-h-full.w-full.max-w-xl.flex-col.overflow-y-hidden.rounded-lg.bg-white.shadow-lg
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
          //- Writer agent.
          LlmAgent(
            agent-id="writer"
            key="writer"
            name="Writer"
            :driver-instance="simulation.writer.llmDriver.value ?? undefined"
            v-model:driver-config="tempWriterConfig"
          )

          //- Director agent.
          LlmAgent(
            agent-id="director"
            key="director"
            name="Director"
            :driver-instance="simulation.director.llmDriver.value ?? undefined"
            v-model:driver-config="tempDirectorConfig"
          )
</template>

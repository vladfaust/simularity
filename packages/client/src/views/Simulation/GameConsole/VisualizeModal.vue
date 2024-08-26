<script setup lang="ts">
import { Simulation } from "@/lib/simulation";
import {
  Dialog,
  DialogPanel,
  TransitionChild,
  TransitionRoot,
} from "@headlessui/vue";
import { useClipboard } from "@vueuse/core";
import { CopyCheckIcon, CopyIcon, PaletteIcon, XIcon } from "lucide-vue-next";
import { ref } from "vue";
import { nonNullable } from "@/lib/utils";

const clipboard = useClipboard();

const props = defineProps<{
  open: boolean;
  simulation: Simulation;
}>();

const emit = defineEmits<{
  (event: "close"): void;
}>();

const pov = ref<boolean>(false);
const sdPrompt = ref<string | undefined>();

const visualizationInProgress = ref(false);
async function visualize() {
  try {
    sdPrompt.value = undefined;
    visualizationInProgress.value = true;
    sdPrompt.value = await props.simulation.inferVisualPrompt(128, {
      pov: pov.value,
    });
  } finally {
    visualizationInProgress.value = false;
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
            PaletteIcon.inline-block(:size="20")
            span.text-lg.font-semibold.leading-tight.tracking-wide Visualize
          .h-0.w-full.shrink.border-b
          button.btn-pressable.btn-neutral.btn.aspect-square.rounded.p-1(
            @click="emit('close')"
          )
            XIcon(:size="20")

        .flex.flex-col.gap-2.p-3
          p.h-32.overflow-y-auto.rounded-lg.bg-neutral-100.p-2 {{ sdPrompt }}
          .flex
            //- Pov checkbox
            label.flex.items-center.gap-1
              input(type="checkbox" v-model="pov")
              span POV
          .flex.w-full.gap-1
            button.btn-pressable.btn-primary.btn-md.btn.w-full.rounded.p-1(
              :disabled="visualizationInProgress"
              @click="visualize"
            )
              span Visualize

            //- Copy button
            button.btn-pressable.btn-neutral.btn.btn-md.rounded(
              :disabled="!sdPrompt"
              @click="clipboard.copy(nonNullable(sdPrompt))"
            )
              CopyCheckIcon.text-success-500(
                :size="20"
                v-if="clipboard.copied.value"
              )
              CopyIcon(:size="20" v-else)
</template>

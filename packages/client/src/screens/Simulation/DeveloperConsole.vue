<script setup lang="ts">
import {
  Dialog,
  DialogPanel,
  TransitionChild,
  TransitionRoot,
} from "@headlessui/vue";
import { ref } from "vue";
import Prompt from "./DeveloperConsole/Prompt.vue";
import { Gpt } from "@/lib/simularity/gpt";
import {
  type StateCommand,
  stateCommandsToCode,
} from "@/lib/simulation/state/commands";

defineProps<{
  open: boolean;
  writer: Gpt | undefined;
  committedWriterPrompt: string;
  uncommittedWriterPrompt: string;
  tempWriterPrompt: string;
  episode: {
    id: string;
    chunks: {
      current: number;
      total: number;
    };
  } | null;
  stageStateDelta: StateCommand[];
}>();

const consoleRef = ref<HTMLInputElement | null>(null);

const emit = defineEmits<{
  (event: "close"): void;
}>();
</script>

<template lang="pug">
Dialog.relative.z-50(
  :open="open"
  @close="emit('close')"
  :unmount="false"
  :static="true"
  :initialFocus="consoleRef"
)
  TransitionRoot(:show="open" as="template")
    //- Dialog panel.
    .fixed.inset-0.overflow-y-auto
      TransitionChild(
        as="template"
        enter="duration-200 ease-out"
        enter-from="opacity-0 -translate-y-full"
        enter-to="opacity-100 translate-y-0"
        leave="duration-200 ease-in"
        leave-from="opacity-100 translate-y-0"
        leave-to="opacity-0 -translate-y-full"
      )
        DialogPanel.flex.h-full.flex-col(class="bg-black/50")
          .grid.h-full.grow.gap-2.overflow-hidden.p-2(class="sm:grid-cols-3")
            //- Info.
            .flex.flex-col.gap-2
              //- Info.
              .flex.flex-col.overflow-hidden.rounded-lg(class="bg-black/50")
                .flex.items-center.justify-between.p-2.text-white(class="bg-black/50")
                  span.font-bold.uppercase.tracking-wide Info

                .flex.flex-col.p-2.text-white
                  span
                    b Episode:&nbsp;
                    code {{ episode?.id || "none" }}
                  span(v-if="episode")
                    b Chunk:&nbsp;
                    | {{ episode.chunks.current }}/{{ episode.chunks.total }}

              //- Stage state.
              .flex.flex-col.overflow-hidden.rounded-lg(class="bg-black/50")
                .flex.items-center.justify-between.p-2.text-white(class="bg-black/50")
                  span.font-bold.uppercase.tracking-wide Stage delta

                textarea.h-full.resize-none.overflow-scroll.bg-transparent.p-2.font-mono.text-white(
                  :value="stateCommandsToCode(stageStateDelta)"
                  readonly
                )

            //- Writer prompt.
            Prompt.col-span-2.rounded-lg(
              :gpt="writer"
              :content="committedWriterPrompt"
              :uncommitted-content="uncommittedWriterPrompt"
              :temp-content="tempWriterPrompt"
              class="bg-black/50"
            )
</template>

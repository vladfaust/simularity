<script setup lang="ts">
import {
  Dialog,
  DialogPanel,
  TransitionChild,
  TransitionRoot,
} from "@headlessui/vue";
import { computed, ref, watch } from "vue";
import { ArrowUpToLineIcon, Undo2Icon } from "lucide-vue-next";
import { Codemirror } from "vue-codemirror";
import { StreamLanguage } from "@codemirror/language";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import { dracula } from "thememirror";
import { autocompletion } from "@codemirror/autocomplete";

const props = defineProps<{
  open: boolean;
  sceneCode: string;
  sceneText: string;
  episode: {
    id: string;
    chunks: {
      current: number;
      total: number;
    };
  } | null;
}>();

const consoleRef = ref<HTMLInputElement | null>(null);

const sceneCode = ref(props.sceneCode);
const sceneCodeChanged = computed(
  () => sceneCode.value.trim() !== props.sceneCode.trim(),
);
function resetSceneCode() {
  sceneCode.value = props.sceneCode;
}
function applySceneCode() {}
watch(
  () => props.sceneCode,
  (value) => {
    console.debug(`Updated sceneCode prop`);
    sceneCode.value = value;
  },
);

const sceneText = ref(props.sceneText);
const sceneTextChanged = computed(
  () => sceneText.value.trim() !== props.sceneText.trim(),
);
function resetSceneText() {
  sceneText.value = props.sceneText;
}
function applySceneText() {}
watch(
  () => props.sceneText,
  (value) => {
    console.debug(`Updated sceneText prop`);
    sceneText.value = value;
  },
);

const emit = defineEmits<{
  (event: "close"): void;
}>();

const codemirrorExtensions = [
  dracula,
  autocompletion({
    override: [
      (context) => {
        let word = context.matchBefore(/\w*/);
        if (!word) return null;

        if (word.from == word.to && !context.explicit) return null;

        return {
          from: word.from,

          options: [
            {
              label: "set_scene",
              type: "function",
              detail: "Set the scene",
            },
            {
              label: "add_character",
              type: "function",
              detail: "Add a character to scene",
            },
          ],
        };
      },
    ],
  }),
  StreamLanguage.define(lua),
];
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
        DialogPanel.flex.w-full.flex-col(class="h-5/6 bg-black/50")
          .grid.grow.gap-2.p-2(class="sm:grid-cols-2")
            //- Text.
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

            //- Text.
            .flex.flex-col.overflow-hidden.rounded-lg(class="bg-black/50")
              .flex.items-center.justify-between.p-2.text-white(class="bg-black/50")
                span.font-bold.uppercase.tracking-wide Text
                .flex.gap-1
                  button.btn.transition-transform.pressable(
                    @click="resetSceneText"
                    :disabled="!sceneTextChanged"
                  )
                    Undo2Icon(:size="20")
                  button.btn.transition-transform.pressable(
                    @click="applySceneText"
                    :disabled="!sceneTextChanged"
                  )
                    ArrowUpToLineIcon(:size="20")
              textarea.h-full.resize-none.overflow-scroll.bg-transparent.p-2.text-white(
                v-model="sceneText"
              )

            //- Code.
            .flex.flex-col.overflow-hidden.rounded-lg(class="bg-black/50")
              .flex.items-center.justify-between.p-2.text-white(class="bg-black/50")
                span.font-bold.uppercase.tracking-wide Code
                .flex.gap-1
                  button.btn.transition-transform.pressable(
                    @click="resetSceneCode"
                    :disabled="!sceneCodeChanged"
                  )
                    Undo2Icon(:size="20")
                  button.btn.transition-transform.pressable(
                    @click="applySceneCode"
                    :disabled="!sceneCodeChanged"
                  )
                    ArrowUpToLineIcon(:size="20")
              Codemirror.h-full.text-sm(
                v-model="sceneCode"
                :extensions="codemirrorExtensions"
              )

          //- Console input.
          .flex.w-full.gap-1.p-1.font-mono.text-sm.text-white(class="bg-black/50")
            span.shrink-0.opacity-50 $
            input.w-full.bg-transparent(ref="consoleRef")
</template>

<style lang="scss" scoped>
.btn {
  @apply disabled:opacity-50;
}
</style>

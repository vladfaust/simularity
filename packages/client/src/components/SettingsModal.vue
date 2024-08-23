<script setup lang="ts">
import { Simulation } from "@/lib/simulation";
import * as storage from "@/lib/storage";
import type { TtsConfig } from "@/lib/storage/tts";
import { clone, tap } from "@/lib/utils";
import {
  Dialog,
  DialogPanel,
  TransitionChild,
  TransitionRoot,
} from "@headlessui/vue";
import {
  AudioLinesIcon,
  ClapperboardIcon,
  CornerRightDownIcon,
  FeatherIcon,
  JoystickIcon,
  SettingsIcon,
  XIcon,
} from "lucide-vue-next";
import { ref } from "vue";
import Director from "./SettingsModal/Director.vue";
import General from "./SettingsModal/General.vue";
import Voicer from "./SettingsModal/Voicer.vue";
import Writer from "./SettingsModal/Writer.vue";

enum Tab {
  General,
  Writer,
  Director,
  Voicer,
}

defineProps<{
  open: boolean;
  simulation: Simulation;
}>();

const emit = defineEmits<{
  (event: "close"): void;
}>();

const tab = ref(Tab.General);

const writerConfig = storage.llm.useDriverConfig("writer");
const tempWriterConfig = ref(tap(writerConfig.value, clone) ?? null);

const directorConfig = storage.llm.useDriverConfig("director");
const tempDirectorConfig = ref(tap(directorConfig.value, clone) ?? null);

const tempTtsConfig = ref<TtsConfig>(
  tap(storage.tts.ttsConfig.value, clone) ?? {
    enabled: false,
    narrator: true,
    mainCharacter: false,
    otherCharacters: true,
  },
);

function onClose() {
  writerConfig.value = tempWriterConfig.value;
  directorConfig.value = tempDirectorConfig.value;
  storage.tts.ttsConfig.value = tempTtsConfig.value;

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
      DialogPanel.flex.max-h-full.w-full.max-w-3xl.flex-col.overflow-y-hidden.rounded-xl.bg-white.shadow-lg
        .flex.items-center.justify-between.gap-2.border-b.p-3
          h1.flex.shrink-0.items-center.gap-1
            SettingsIcon.inline-block(:size="20" class="hover:animate-spin")
            span.text-lg.font-semibold.leading-tight.tracking-wide Settings
          .h-0.w-full.shrink.border-b
          button.btn-pressable.btn-neutral.btn.aspect-square.rounded.p-1(
            @click="onClose"
          )
            XIcon(:size="20")

        .grid.h-full.grid-cols-4.overflow-y-hidden
          //- FIXME: Overflow-y-scroll doesn't work here.
          .flex.h-full.flex-col.overflow-y-scroll.border-r
            ._tab(
              :class="{ _selected: tab === Tab.General }"
              @click="tab = Tab.General"
            )
              ._icon
                JoystickIcon(:size="20")
              span General

            .flex.items-center.justify-between.gap-1.border-b.p-2.pl-4.text-gray-500
              span.text-sm AI Agents
              CornerRightDownIcon(:size="18")

            ._tab(
              :class="{ _selected: tab === Tab.Writer }"
              @click="tab = Tab.Writer"
            )
              ._icon
                FeatherIcon(:size="20")
              span Writer

            ._tab(
              :class="{ _selected: tab === Tab.Director }"
              @click="tab = Tab.Director"
            )
              ._icon
                ClapperboardIcon(:size="20")
              span Director

            ._tab(
              :class="{ _selected: tab === Tab.Voicer }"
              @click="tab = Tab.Voicer"
            )
              ._icon
                AudioLinesIcon(:size="20")
              span Voicer

          .col-span-3.h-full.overflow-y-scroll
            .h-full(style="min-height: 32rem")
              //- General tab.
              General(v-if="tab === Tab.General" :simulation)

              //- Writer agent tab.
              Writer(
                v-else-if="tab === Tab.Writer"
                :simulation
                v-model:driver-config="tempWriterConfig"
              )

              //- Director agent tab.
              Director(
                v-else-if="tab === Tab.Director"
                :simulation
                v-model:driver-config="tempDirectorConfig"
              )

              //- Voicer agent tab.
              Voicer(
                v-else-if="tab === Tab.Voicer"
                :simulation
                v-model:tts-config="tempTtsConfig"
              )
</template>

<style lang="scss" scoped>
._tab {
  @apply flex cursor-pointer items-center gap-2 border-b p-3;

  span {
    @apply font-medium tracking-wide;
  }

  &._selected {
    @apply bg-gray-50 text-primary-500 shadow-inner;
  }

  ._icon {
    @apply grid place-items-center rounded-lg border bg-white p-1;
  }
}
</style>

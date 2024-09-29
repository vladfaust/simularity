<script setup lang="ts">
import CustomTitle from "@/components/CustomTitle.vue";
import { env } from "@/env";
import { Mode, Simulation } from "@/lib/simulation";
import * as storage from "@/lib/storage";
import { directorTeacherMode } from "@/lib/storage/llm";
import type { TtsConfig } from "@/lib/storage/tts";
import { clone, tap } from "@/lib/utils";
import { deepEqual } from "fast-equals";
import {
  AsteriskIcon,
  AudioLinesIcon,
  ClapperboardIcon,
  FeatherIcon,
  SaveIcon,
  SettingsIcon,
} from "lucide-vue-next";
import { computed, onUnmounted, ref } from "vue";
import Director from "./SettingsModal/Director.vue";
import LlmStatusIcon from "./SettingsModal/LlmAgent/StatusIcon.vue";
import Voicer from "./SettingsModal/Voicer.vue";
import VoicerStatusIcon from "./SettingsModal/Voicer/StatusIcon.vue";
import Writer from "./SettingsModal/Writer.vue";

enum Tab {
  Writer,
  Director,
  Voicer,
}

defineProps<{
  simulation?: Simulation;
}>();

const emit = defineEmits<{
  (event: "close"): void;
}>();

const DEFAULT_TAB = Tab.Writer;
const tab = ref(DEFAULT_TAB);

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

const anyChanges = computed(() => {
  return !(
    deepEqual(clone(writerConfig.value), clone(tempWriterConfig.value)) &&
    deepEqual(clone(directorConfig.value), clone(tempDirectorConfig.value)) &&
    deepEqual(clone(storage.tts.ttsConfig.value), clone(tempTtsConfig.value))
  );
});

function save() {
  if (!anyChanges.value) {
    return;
  }

  writerConfig.value = tempWriterConfig.value;
  tempWriterConfig.value = clone(writerConfig.value);

  directorConfig.value = tempDirectorConfig.value;
  tempDirectorConfig.value = clone(directorConfig.value);

  storage.tts.ttsConfig.value = clone(tempTtsConfig.value);
  tempTtsConfig.value = clone(storage.tts.ttsConfig.value);
}

onUnmounted(() => {
  save();
});
</script>

<template lang="pug">
.flex.flex-col
  CustomTitle.border-b.p-3(:hide-border="!anyChanges")
    template(#icon)
      SettingsIcon(:size="20")

    template(#extra)
      .flex.items-center.gap-1(v-if="anyChanges")
        button.btn-pressable.btn.btn-sm-square.rounded-lg.border(
          class="hover:btn-primary hover:border-transparent"
          @click="save"
        )
          SaveIcon(:size="18")
      .h-7(v-else)

    .flex.items-center
      span.font-semibold.leading-snug.tracking-wide Settings
      AsteriskIcon.cursor-help.text-primary-500(
        :size="18"
        v-if="anyChanges"
        v-tooltip="'Some changes will be applied after close'"
      )

  .flex.h-full.flex-col.overflow-hidden
    .flex.w-full.divide-x.border-b
      //- Writer agent tab.
      ._tab(
        :class="{ _selected: tab === Tab.Writer }"
        @click="tab = Tab.Writer"
      )
        ._name
          ._icon
            FeatherIcon(:size="20")
          span Writer
        .flex.items-center(v-if="simulation")
          LlmStatusIcon(
            :driver="simulation.writer.llmDriver.value"
            :required="true"
          )

      //- Director agent tab.
      ._tab(
        :class="{ _selected: tab === Tab.Director }"
        @click="tab = Tab.Director"
      )
        ._name
          ._icon
            ClapperboardIcon(:size="20")
          span Director
        LlmStatusIcon(
          v-if="simulation"
          :driver="simulation.director?.llmDriver.value"
          :required="simulation.mode === Mode.Immersive && (!env.VITE_EXPERIMENTAL_FEATURES || !directorTeacherMode)"
        )

      //- Voicer agent tab.
      ._tab(
        :class="{ _selected: tab === Tab.Voicer }"
        @click="tab = Tab.Voicer"
      )
        ._name
          ._icon
            AudioLinesIcon(:size="20")
          span Voicer
        VoicerStatusIcon(
          v-if="simulation"
          :driver="simulation.voicer.ttsDriver.value"
        )

    //- Tab content.
    .h-full.overflow-y-scroll
      //- Writer agent tab.
      Writer(
        v-if="tab === Tab.Writer"
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
  @apply flex w-full cursor-pointer items-center justify-center gap-2 p-2;

  &._selected {
    @apply text-primary-500;
  }

  ._name {
    @apply flex items-center gap-2;

    ._icon {
      @apply grid place-items-center rounded-lg border bg-white p-1;
    }

    span {
      @apply font-medium tracking-wide;
    }
  }
}
</style>

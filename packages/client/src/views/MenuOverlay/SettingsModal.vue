<script setup lang="ts">
import RichTitle from "@/components/RichForm/RichTitle.vue";
import { trackPageview } from "@/lib/plausible";
import { Simulation } from "@/lib/simulation";
import * as storage from "@/lib/storage";
import type { TtsConfig } from "@/lib/storage/tts";
import { clone, tap } from "@/lib/utils";
import { deepEqual } from "fast-equals";
import {
  AppWindowIcon,
  AsteriskIcon,
  AudioLinesIcon,
  FeatherIcon,
  SaveIcon,
  SettingsIcon,
} from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import AppSettings from "./SettingsModal/AppSettings.vue";
import LlmStatusIcon from "./SettingsModal/LlmAgent/StatusIcon.vue";
import Voicer from "./SettingsModal/Voicer.vue";
import VoicerStatusIcon from "./SettingsModal/Voicer/StatusIcon.vue";
import Writer from "./SettingsModal/Writer.vue";

enum Tab {
  App,
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

const DEFAULT_TAB = Tab.App;
const tab = ref(DEFAULT_TAB);

const writerConfig = storage.llm.useDriverConfig("writer");
const tempWriterConfig = ref(tap(writerConfig.value, clone) ?? null);

const tempTtsConfig = ref<TtsConfig>(
  tap(storage.tts.ttsConfig.value, clone) ?? {
    narrator: true,
    mainCharacter: false,
    otherCharacters: true,
  },
);

const anyChanges = computed(() => {
  return !(
    deepEqual(clone(writerConfig.value), clone(tempWriterConfig.value)) &&
    deepEqual(clone(storage.tts.ttsConfig.value), clone(tempTtsConfig.value))
  );
});

function save() {
  if (!anyChanges.value) {
    return;
  }

  writerConfig.value = tempWriterConfig.value;
  tempWriterConfig.value = clone(writerConfig.value);

  storage.tts.ttsConfig.value = clone(tempTtsConfig.value);
  tempTtsConfig.value = clone(storage.tts.ttsConfig.value);
}

onMounted(() => {
  trackPageview("/settings");
});

onUnmounted(() => {
  save();
});

const { t } = useI18n({
  messages: {
    "en-US": {
      settings: {
        label: "Settings",
        gotChanges: "Some changes will be applied after close",
        application: "Application",
        writer: "Writer",
        director: "Director",
        voicer: "Voicer",
      },
    },
    "ru-RU": {
      settings: {
        label: "Настройки",
        gotChanges: "Некоторые изменения будут применены после закрытия",
        application: "Приложение",
        writer: "Писатель",
        director: "Режиссер",
        voicer: "Озвучиватель",
      },
    },
  },
});
</script>

<template lang="pug">
.flex.flex-col
  RichTitle.border-b.p-3(:hide-border="!anyChanges")
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
      span.font-semibold.leading-snug.tracking-wide {{ t("settings.label") }}
      AsteriskIcon.cursor-help.text-primary-500(
        :size="18"
        v-if="anyChanges"
        v-tooltip="t('settings.gotChanges')"
      )

  .flex.h-full.flex-col.overflow-hidden
    .flex.w-full.divide-x.overflow-x-scroll.border-b
      //- Application settings tab.
      ._tab(:class="{ _selected: tab === Tab.App }" @click="tab = Tab.App")
        ._name
          ._icon
            AppWindowIcon(:size="20")
          span {{ t("settings.application") }}

      //- Writer agent tab.
      ._tab(
        :class="{ _selected: tab === Tab.Writer }"
        @click="tab = Tab.Writer"
      )
        ._name
          ._icon
            FeatherIcon(:size="20")
          span {{ t("settings.writer") }}
        .flex.items-center(v-if="simulation")
          LlmStatusIcon(
            :driver="simulation.writer.llmDriver.value"
            :required="true"
          )

      //- Voicer agent tab.
      ._tab(
        :class="{ _selected: tab === Tab.Voicer }"
        @click="tab = Tab.Voicer"
      )
        ._name
          ._icon
            AudioLinesIcon(:size="20")
          span {{ t("settings.voicer") }}
        VoicerStatusIcon(
          v-if="simulation"
          :driver="simulation.voicer.ttsDriver.value"
        )

    //- Tab content.
    .h-full.overflow-y-scroll
      //- Application settings tab.
      AppSettings(v-if="tab === Tab.App")

      //- Writer agent tab.
      Writer(
        v-if="tab === Tab.Writer"
        :simulation
        v-model:driver-config="tempWriterConfig"
      )

      //- Voicer agent tab.
      Voicer(
        v-else-if="tab === Tab.Voicer"
        :simulation
        v-model:tts-config="tempTtsConfig"
      )
</template>

<style lang="postcss" scoped>
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

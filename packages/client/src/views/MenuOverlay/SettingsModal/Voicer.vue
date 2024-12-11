<script setup lang="ts">
import Alert from "@/components/Alert.vue";
import InteractiveHelper from "@/components/InteractiveHelper.vue";
import RichRange from "@/components/RichForm/RichRange.vue";
import RichToggle from "@/components/RichForm/RichToggle.vue";
import { env } from "@/env";
import { Simulation } from "@/lib/simulation";
import * as storage from "@/lib/storage";
import { unreachable } from "@/lib/utils";
import {
  BotIcon,
  CloudIcon,
  CpuIcon,
  CrownIcon,
  DramaIcon,
  Settings2Icon,
  SpeechIcon,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import RemoteModelSettings from "./Voicer/RemoteModelSettings.vue";

defineProps<{
  simulation?: Simulation;
}>();

const ttsConfig = defineModel<storage.tts.TtsConfig>("ttsConfig", {
  required: true,
});

const ttsEnabled = computed(
  () =>
    ttsConfig.value?.narrator ||
    ttsConfig.value?.mainCharacter ||
    ttsConfig.value?.otherCharacters,
);

const driverType = ref<"remote">(ttsConfig.value.driver?.type ?? "remote");

const selectedModelId = computed<string | undefined>({
  get: () => ttsConfig.value.driver?.modelId,
  set: (modelId: string | undefined) => {
    if (!modelId) return;

    switch (driverType.value) {
      case "remote":
        ttsConfig.value.driver = {
          type: driverType.value,
          baseUrl: env.VITE_API_BASE_URL,
          modelId,
        };
        break;
      default:
        throw unreachable(driverType.value);
    }
  },
});

const { t } = useI18n({
  messages: {
    "en-US": {
      settings: {
        voicer: {
          description:
            "Voicer is an optional TTS (Text-to-Speech) agent which gives voice to the characters. It can be enabled or disabled at any time.",
          speechVolume: "Speech Volume",
          enableVoiceGeneration: "Enable voice generation",
          charactersVoiceover: "Characters voiceover",
          narratorVoiceover: "Narrator voiceover",
          mainCharacterVoiceover: "Main character voiceover",
          enableTextSplitting: "Enable text splitting",
          enableTextSplittingHelp:
            "Split text into sentences for improved stability",
          model: "Model",
          local: {
            label: "Local",
            tooltip: "Local driver is not available yet.",
          },
          remote: {
            label: "Remote",
          },
        },
      },
    },
    "ru-RU": {
      settings: {
        voicer: {
          description:
            "Озвучиватель — это необязательный агент TTS (Text-to-Speech), который придает голос персонажам. Его можно включить или выключить в любое время.",
          speechVolume: "Громкость речи",
          enableVoiceGeneration: "Включить генерацию голоса",
          charactersVoiceover: "Озвучка персонажей",
          narratorVoiceover: "Озвучка рассказчика",
          mainCharacterVoiceover: "Озвучка главного персонажа",
          enableTextSplitting: "Включить разделение текста",
          enableTextSplittingHelp:
            "Разделение текста на предложения улучшает стабильность",
          model: "Модель",
          local: {
            label: "Локальная",
            tooltip: "Локальный драйвер пока что недоступен.",
          },
          remote: {
            label: "Облачная",
          },
        },
      },
    },
  },
});
</script>

<template lang="pug">
.flex.flex-col
  InteractiveHelper.border-b(:show-background="false")
    Alert.bg-white(type="info") {{ t("settings.voicer.description") }}

  .flex.flex-col.gap-2.p-3
    .flex.flex-col.gap-2.rounded-lg.bg-white.p-3.shadow-lg
      RichRange#speech-volume(
        :title="t('settings.voicer.speechVolume')"
        v-model="storage.speechVolumeStorage.value"
        :percent="true"
      )
        template(#icon)
          SpeechIcon(:size="16")

      //- Enable or disable voicing automatically.
      RichToggle#auto-enabled(
        :title="t('settings.voicer.charactersVoiceover')"
        v-model="ttsConfig.otherCharacters"
      )
        template(#icon)
          DramaIcon(:size="16")

      //- Enable or disable narrator voicer.
      RichToggle#narrator-enabled(
        :title="t('settings.voicer.narratorVoiceover')"
        v-model="ttsConfig.narrator"
      )
        template(#icon)
          BotIcon(:size="16")

      //- Enable or disable main character voicer.
      RichToggle#main-character-enabled(
        :title="t('settings.voicer.mainCharacterVoiceover')"
        v-model="ttsConfig.mainCharacter"
      )
        template(#icon)
          CrownIcon(:size="16")

      //- Switch text splitting.
      RichToggle#enable-text-splitting(
        :title="t('settings.voicer.enableTextSplitting')"
        v-model="storage.tts.enableTextSplitting.value"
        :help="t('settings.voicer.enableTextSplittingHelp')"
      )
        template(#icon)
          Settings2Icon(:size="16")

    //- Model selection.
    .flex.flex-col(:class="{ 'opacity-50 pointer-events-none': !ttsEnabled }")
      .flex.w-full.items-center.justify-between
        h2.font-semibold.leading-tight.tracking-wide {{ t("settings.voicer.model") }}
        .ml-2.h-0.w-full.border-t

        //- Driver tabs.
        .grid.shrink-0.grid-cols-2.gap-1.overflow-hidden.rounded-t-lg.border-x.border-t.p-2
          button.btn-neutral.btn.btn-sm.w-full.rounded-lg.transition-transform.pressable(
            disabled
            v-tooltip="t('settings.voicer.local.tooltip')"
          )
            CpuIcon(:size="20")
            span {{ t("settings.voicer.local.label") }}
          button.btn.btn-sm.rounded-lg.transition-transform.pressable(
            :class="{ 'btn-primary': driverType === 'remote', 'btn-neutral': driverType !== 'remote' }"
            @click="driverType = 'remote'"
          )
            CloudIcon(:size="20")
            span {{ t("settings.voicer.remote.label") }}

      //- Driver content.
      .flex.w-full.flex-col.gap-2.overflow-hidden.rounded-b-lg.rounded-l-lg.border
        //- Remote driver.
        RemoteModelSettings(
          v-if="driverType === 'remote'"
          :selected-model-id="selectedModelId"
          @selectModel="selectedModelId = $event"
        )
</template>

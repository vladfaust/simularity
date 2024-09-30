<script setup lang="ts">
import Alert from "@/components/Alert.vue";
import InteractiveHelper from "@/components/InteractiveHelper.vue";
import RichRange from "@/components/RichForm/RichRange.vue";
import RichToggle from "@/components/RichForm/RichToggle.vue";
import { Simulation } from "@/lib/simulation";
import * as storage from "@/lib/storage";
import { unreachable } from "@/lib/utils";
import {
  AudioLinesIcon,
  BotIcon,
  CrownIcon,
  DramaIcon,
  GlobeIcon,
  HardDriveIcon,
  SpeechIcon,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import RemoteModelSettings from "./Voicer/RemoteModelSettings.vue";

defineProps<{
  simulation?: Simulation;
}>();

const ttsConfig = defineModel<storage.tts.TtsConfig>("ttsConfig", {
  required: true,
});

const driverType = ref<"remote">(ttsConfig.value.driver?.type ?? "remote");

const selectedModelId = computed<string | undefined>({
  get: () => ttsConfig.value.driver?.modelId,
  set: (modelId: string | undefined) => {
    if (!modelId) return;

    switch (driverType.value) {
      case "remote":
        ttsConfig.value.driver = {
          type: driverType.value,
          baseUrl: import.meta.env.VITE_API_BASE_URL,
          modelId,
        };
        break;
      default:
        throw unreachable(driverType.value);
    }
  },
});
</script>

<template lang="pug">
.flex.flex-col
  InteractiveHelper.border-b(:show-background="false")
    Alert.bg-white(type="info")
      | Voicer is an optional TTS (Text-to-Speech) agent which gives voice to the characters. It can be enabled or disabled at any time.

  .flex.flex-col.gap-2.p-3
    .flex.flex-col.gap-2.rounded-lg.bg-white.p-3.shadow-lg
      RichRange#speech-volume(
        title="Speech Volume"
        v-model="storage.speechVolumeStorage.value"
        :percent="true"
      )
        template(#icon)
          SpeechIcon(:size="16")

      //- TODO: Replace with "anything is enabled => enable driver" logic.
      RichToggle#voicer-enabled(
        title="Enable voice generation"
        v-model="ttsConfig.enabled"
      )
        template(#icon)
          AudioLinesIcon(:size="16")

      //- Enable or disable voicing automatically.
      RichToggle#auto-enabled(
        title="Characters voiceover"
        v-model="ttsConfig.otherCharacters"
      )
        template(#icon)
          DramaIcon(:size="16")

      //- Enable or disable narrator voicer.
      RichToggle#narrator-enabled(
        title="Narrator voiceover"
        v-model="ttsConfig.narrator"
      )
        template(#icon)
          BotIcon(:size="16")

      //- Enable or disable main character voicer.
      RichToggle#main-character-enabled(
        title="Main character voiceover"
        v-model="ttsConfig.mainCharacter"
      )
        template(#icon)
          CrownIcon(:size="16")

    //- Model selection.
    .flex.flex-col(
      :class="{ 'opacity-50 pointer-events-none': !ttsConfig.enabled }"
    )
      .flex.w-full.items-center.justify-between
        h2.font-semibold.leading-tight.tracking-wide Model
        .ml-2.h-0.w-full.border-t

        //- Driver tabs.
        .grid.shrink-0.grid-cols-2.gap-1.overflow-hidden.rounded-t-lg.border-x.border-t.p-2
          button.btn-neutral.btn.btn-sm.w-full.rounded.transition-transform.pressable(
            disabled
            v-tooltip="'Local driver is not available yet.'"
          )
            HardDriveIcon(:size="20")
            span Local
          button.btn.btn-sm.rounded.transition-transform.pressable(
            :class="{ 'btn-primary': driverType === 'remote', 'btn-neutral': driverType !== 'remote' }"
            @click="driverType = 'remote'"
          )
            GlobeIcon(:size="20")
            span Remote

      //- Driver content.
      .flex.w-full.flex-col.gap-2.overflow-hidden.rounded-b-lg.rounded-l-lg.border
        //- Remote driver.
        RemoteModelSettings(
          v-if="driverType === 'remote'"
          :selected-model-id="selectedModelId"
          @selectModel="selectedModelId = $event"
        )
</template>

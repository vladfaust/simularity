<script setup lang="ts">
import Alert from "@/components/Alert.vue";
import CharacterPfp from "@/components/CharacterPfp.vue";
import Toggle from "@/components/Toggle.vue";
import { Simulation } from "@/lib/simulation";
import * as storage from "@/lib/storage";
import { unreachable } from "@/lib/utils";
import {
  BotIcon,
  CircleHelpIcon,
  GlobeIcon,
  HardDriveIcon,
  PersonStandingIcon,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import RemoteModelSettings from "./Voicer/RemoteModelSettings.vue";

const { simulation } = defineProps<{
  simulation: Simulation;
}>();

const ttsConfig = defineModel<storage.tts.TtsConfig>("ttsConfig", {
  required: true,
});

const mainCharacterId = computed(() => simulation.scenario.defaultCharacterId);
const driverType = ref<"remote">(ttsConfig.value.driver?.type ?? "remote");

const selectedModelId = computed<string | undefined>({
  get: () => ttsConfig.value.driver?.modelId,
  set: (modelId: string | undefined) => {
    if (!modelId) return;

    switch (driverType.value) {
      case "remote":
        ttsConfig.value.driver = {
          type: driverType.value,
          baseUrl: import.meta.env.VITE_DEFAULT_API_BASE_URL,
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
.flex.flex-col.gap-2.p-3
  Alert(type="info")
    | Voicer is an optional TTS (Text-to-Speech) agent which gives voice to the characters. It can be enabled or disabled at any time.

  //- Enable or disable the voicer agent.
  .flex.items-center.justify-between.gap-2
    label.flex.shrink-0.cursor-pointer.items-center.gap-1(for="voicer-enabled")
      span.font-medium Enable Voicer
    .w-full.border-b
    Toggle#voicer-enabled(v-model="ttsConfig.enabled")

  //- Model selection.
  .flex.flex-col(v-if="ttsConfig.enabled")
    .flex.w-full.items-center.justify-between
      h2.font-semibold.leading-tight.tracking-wide Model
      .ml-2.h-0.w-full.border-t

      //- Driver tabs.
      .grid.shrink-0.grid-cols-2.gap-1.overflow-hidden.rounded-t-lg.border-x.border-t.p-2
        button.btn-neutral.btn.btn-sm.w-full.rounded.transition-transform.pressable(
          disabled
          tip="Local driver is not available yet."
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

  //- Voiceover settings.
  .flex.flex-col.gap-2.rounded-lg.border.p-2(v-if="ttsConfig.enabled")
    //- Enable or disable voicing automatically.
    .flex.items-center.justify-between.gap-2
      .flex.shrink-0.items-center.gap-1
        label.flex.cursor-pointer.items-center.gap-1(for="auto-enabled")
          .grid.aspect-square.h-6.place-items-center.rounded.border
            PersonStandingIcon(:size="16")
          span Characters voiceover
        CircleHelpIcon(:size="16")
      .w-full.border-b
      Toggle#auto-enabled(v-model="ttsConfig.otherCharacters")

    //- Enable or disable narrator voicer.
    .flex.items-center.justify-between.gap-2
      .flex.shrink-0.items-center.gap-1
        label.flex.cursor-pointer.items-center.gap-1(for="narrator-enabled")
          .grid.aspect-square.h-6.place-items-center.rounded.border
            BotIcon(:size="16")
          span Narrator voiceover
        CircleHelpIcon(:size="16")
      .w-full.border-b
      Toggle#narrator-enabled(v-model="ttsConfig.narrator")

    //- Enable or disable main character voicer.
    .flex.items-center.justify-between.gap-2
      .flex.shrink-0.items-center.gap-1
        label.flex.cursor-pointer.items-center.gap-1(
          for="main-character-enabled"
        )
          CharacterPfp.aspect-square.h-6.rounded.border(
            :scenario="simulation.scenario"
            :character="simulation.scenario.characters[mainCharacterId]"
          )
          span Main character voiceover
        CircleHelpIcon(:size="16")
      .w-full.border-b
      Toggle#main-character-enabled(v-model="ttsConfig.mainCharacter")
</template>

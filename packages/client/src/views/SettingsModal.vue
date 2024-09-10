<script setup lang="ts">
import { Mode, Simulation } from "@/lib/simulation";
import * as storage from "@/lib/storage";
import type { TtsConfig } from "@/lib/storage/tts";
import { clone, tap } from "@/lib/utils";
import { onLoginButtonClick } from "@/logic/loginButton";
import {
  accountBalanceQueryKey,
  accountQueryKey,
  useAccountBalanceQuery,
} from "@/queries";
import {
  Dialog,
  DialogPanel,
  TransitionChild,
  TransitionRoot,
} from "@headlessui/vue";
import { useQueryClient } from "@tanstack/vue-query";
import { deepEqual } from "fast-equals";
import {
  AsteriskIcon,
  AudioLinesIcon,
  ClapperboardIcon,
  CornerRightDownIcon,
  FeatherIcon,
  JoystickIcon,
  Loader2Icon,
  LogInIcon,
  SettingsIcon,
  UserCircle2Icon,
  XIcon,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import Account from "./SettingsModal/Account.vue";
import Director from "./SettingsModal/Director.vue";
import General from "./SettingsModal/General.vue";
import LlmStatusIcon from "./SettingsModal/LlmAgent/StatusIcon.vue";
import Voicer from "./SettingsModal/Voicer.vue";
import VoicerStatusIcon from "./SettingsModal/Voicer/StatusIcon.vue";
import Writer from "./SettingsModal/Writer.vue";

enum Tab {
  General,
  Writer,
  Director,
  Voicer,
  Account,
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

const anyChanges = computed(() => {
  return !(
    deepEqual(writerConfig.value, tempWriterConfig.value) &&
    deepEqual(directorConfig.value, tempDirectorConfig.value) &&
    deepEqual(storage.tts.ttsConfig.value, tempTtsConfig.value)
  );
});

const accountBalanceQuery = useAccountBalanceQuery();
const loginInProgress = ref(false);
const queryClient = useQueryClient();

function onClose() {
  writerConfig.value = tempWriterConfig.value;
  directorConfig.value = tempDirectorConfig.value;
  storage.tts.ttsConfig.value = clone(tempTtsConfig.value);

  emit("close");
}

async function login() {
  await onLoginButtonClick(loginInProgress, false, true);
  await queryClient.invalidateQueries({ queryKey: accountQueryKey() });
  await queryClient.invalidateQueries({ queryKey: accountBalanceQueryKey() });
  tab.value = Tab.Account;
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
      DialogPanel.flex.h-full.w-full.max-w-4xl.flex-col.overflow-y-hidden.rounded-xl.bg-white.shadow-lg
        .flex.items-center.justify-between.gap-2.border-b.p-3
          h1.flex.shrink-0.items-center.gap-1
            SettingsIcon.inline-block(:size="20" class="hover:animate-spin")
            span.text-lg.font-semibold.leading-tight.tracking-wide Settings
            AsteriskIcon.text-primary-500(
              v-if="anyChanges"
              title="Changes will be applied when you close settings."
              :size="18"
            )
          .h-0.w-full.shrink.border-b
          button.btn-pressable.btn-neutral.btn.aspect-square.rounded.p-1(
            @click="onClose"
          )
            XIcon(:size="20")

        .grid.h-full.grid-cols-4.overflow-y-hidden
          //- FIXME: Overflow-y-scroll doesn't work here.
          .flex.h-full.flex-col.overflow-y-scroll.border-r
            //- Account tab.
            ._tab(
              v-if="storage.remoteServerJwt.value"
              :class="{ _selected: tab === Tab.Account }"
              @click="tab = Tab.Account"
            )
              ._name
                ._icon
                  UserCircle2Icon(:size="20")
                span Account
              span.rounded.border.border-primary-600.bg-primary-500.px-2.py-1.font-mono.text-xs.font-medium.text-primary-base(
                title="Credit balance"
              ) {{ accountBalanceQuery.data.value?.credit ?? 0 }}¢
            .border-b.p-3(v-else)
              button.btn.btn-md.btn-primary.btn-pressable.w-full.rounded-lg(
                @click="login"
              )
                Loader2Icon.animate-spin(
                  v-if="loginInProgress"
                  :size="20"
                  :stroke-width="2.5"
                )
                LogInIcon(v-else :size="20")
                | Cloud login

            //- General tab.
            ._tab(
              :class="{ _selected: tab === Tab.General }"
              @click="tab = Tab.General"
            )
              ._name
                ._icon
                  JoystickIcon(:size="20")
                span General

            //- AI Agents "tab".
            .flex.items-center.justify-between.gap-1.border-b.p-2.pl-4.text-gray-500
              span.text-sm AI Agents
              CornerRightDownIcon(:size="18")

            //- Writer agent tab.
            ._tab(
              :class="{ _selected: tab === Tab.Writer }"
              @click="tab = Tab.Writer"
            )
              ._name
                ._icon
                  FeatherIcon(:size="20")
                span Writer
              .flex.items-center
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
                :driver="simulation.director?.llmDriver.value"
                :required="simulation.mode === Mode.Immersive"
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
              VoicerStatusIcon(:driver="simulation.voicer.ttsDriver.value")

          //- Tab content.
          .col-span-3.h-full.overflow-y-scroll
            .h-full
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

              //- Account tab.
              Account(
                v-else-if="tab === Tab.Account"
                @logout="tab = Tab.General"
              )
</template>

<style lang="scss" scoped>
._tab {
  @apply flex cursor-pointer items-center justify-between gap-2 border-b p-3;

  &._selected {
    @apply bg-gray-50 text-primary-500 shadow-inner;
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

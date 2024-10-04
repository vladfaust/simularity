<script lang="ts">
export enum Tab {
  Scenario,
  LoadGame,
  Account,
  Settings,
  Library,
}
</script>

<script setup lang="ts">
import FooterVue from "@/components/Footer.vue";
import TransitionImage from "@/components/TransitionImage.vue";
import { LocalBaseScenario, LocalImmersiveScenario } from "@/lib/scenario";
import type { Simulation } from "@/lib/simulation";
import { selectedScenarioId } from "@/lib/storage";
import { useScenarioQuery } from "@/queries";
import router, { routeLocation } from "@/router";
import SavesVue from "@/views/MenuOverlay/Saves.vue";
import { TransitionRoot } from "@headlessui/vue";
import { dialog } from "@tauri-apps/api";
import { asyncComputed, watchImmediate } from "@vueuse/core";
import {
  DoorOpenIcon,
  HistoryIcon,
  SettingsIcon,
  SparkleIcon,
  Undo2Icon,
  User2Icon,
} from "lucide-vue-next";
import { ref, watch } from "vue";
import Account from "./MenuOverlay/Account.vue";
import Library from "./MenuOverlay/Library.vue";
import NewGameModal from "./MenuOverlay/NewGameModal.vue";
import Scenario from "./MenuOverlay/Scenario.vue";
import SettingsModal from "./MenuOverlay/SettingsModal.vue";
import GpuStatus from "./Simulation/GpuStatus.vue";

const props = defineProps<{
  simulation?: Simulation;
  tab?: Tab;
}>();

const emit = defineEmits<{
  (event: "backToGame"): void;
  (event: "tabChange", tab: Tab): void;
}>();

const scenario = useScenarioQuery(selectedScenarioId);
const scenarioTitle = asyncComputed(() => scenario.value?.name);
const scenarioLogo = asyncComputed(() => scenario.value?.getLogoUrl());

const tab = ref(
  props.tab ?? selectedScenarioId.value ? Tab.Scenario : Tab.Library,
);

watch(tab, (newTab) => emit("tabChange", newTab));

/**
 * String means an episode ID.
 * Null means the default episode.
 * Undefined means no request.
 */
const newGameRequest = ref<string | null | undefined>();
const newGameRequestEpisodeId = ref<string | undefined>();
watchImmediate(newGameRequest, (episodeId) => {
  if (episodeId || episodeId === null) {
    newGameRequestEpisodeId.value = episodeId ?? undefined;
  } else {
    setTimeout(() => (newGameRequestEpisodeId.value = undefined), 500);
  }
});

const transition = {
  enter: "duration-[200ms] ease-out",
  enterFrom: "opacity-0 scale-95 -translate-x-1/3",
  enterTo: "opacity-100 scale-100 translate-x-0",
  leave: "duration-[200ms] ease-in",
  leaveFrom: "opacity-100 scale-100 translate-x-0",
  leaveTo: "opacity-0 scale-95 -translate-x-1/3",
};

async function exit() {
  if (
    !(await dialog.confirm("Are you sure you want to exit?", {
      okLabel: "Exit",
      title: "Exit",
      type: "warning",
    }))
  ) {
    return;
  }

  router.push(routeLocation({ name: "Shutdown" }));
}
</script>

<template lang="pug">
.grid.grid-cols-4.overflow-hidden.backdrop-blur(class="xl:grid-cols-6")
  .flex.flex-col.items-center.justify-between.gap-2.border-r.p-3(class="bg-white/90")
    //- Logo button.
    button.btn.aspect-video.w-full.max-w-56.gap-2.overflow-hidden.rounded-lg.border.p-3.transition.pressable-sm(
      @click="tab === Tab.Scenario ? (tab = Tab.Library) : (tab = Tab.Scenario)"
      class="hover:bg-white"
      :title="tab === Tab.Scenario ? 'Change scenario' : 'Back to scenario'"
    )
      .w-full(v-if="scenarioLogo")
        TransitionImage.pointer-events-none.select-none.object-contain(
          :src="scenarioLogo"
          alt="Scenario logo"
        )
      span.text-nowrap.text-lg.font-bold(v-else-if="scenarioTitle") {{ scenarioTitle }}
      span.font-bold(v-else) Choose scenario

    .flex.flex-col.items-center.gap-2
      //- Back to simulation button.
      button._btn(v-if="simulation" @click="$emit('backToGame')")
        Undo2Icon(:size="20")
        | Back to game

      //- New game button.
      button._btn(
        v-else-if="(scenario instanceof LocalBaseScenario || scenario instanceof LocalImmersiveScenario) && true"
        @click="newGameRequest = null"
      )
        SparkleIcon(:size="20")
        | New game

      //- Load game button.
      button._btn(
        v-if="(scenario instanceof LocalBaseScenario || scenario instanceof LocalImmersiveScenario) && true"
        @click="tab = Tab.LoadGame"
        :class="{ _selected: tab === Tab.LoadGame }"
      )
        HistoryIcon(:size="20")
        | Load game

      //- Settings button.
      button._btn(
        @click="tab = Tab.Settings"
        :class="{ _selected: tab === Tab.Settings }"
      )
        SettingsIcon(:size="20")
        | Settings
        GpuStatus.ml-1(v-if="simulation" :simulation)

      //- Account button.
      button._btn(
        @click="tab = Tab.Account"
        :class="{ _selected: tab === Tab.Account }"
      )
        User2Icon(:size="20")
        | Account

      //- Exit button.
      button._btn._danger(@click="exit")
        DoorOpenIcon(:size="20")
        | Exit

    //- Footer.
    .px-3
      FooterVue

  .relative.col-span-3.h-full.w-full.overflow-hidden(class="bg-white/90 xl:col-span-5")
    TransitionRoot.absolute.h-full.w-full(
      :show="tab === Tab.Scenario"
      v-bind="transition"
    )
      Scenario.h-full(
        v-if="selectedScenarioId !== null"
        :scenario-id="selectedScenarioId"
        @back="tab = Tab.Library"
        @new-game="(e) => (newGameRequest = e ?? null)"
      )

    TransitionRoot.absolute.h-full.w-full(
      :show="tab === Tab.LoadGame"
      v-bind="transition"
    )
      SavesVue.h-full(
        v-if="selectedScenarioId !== null"
        :scenario-id="selectedScenarioId"
      )

    TransitionRoot.absolute.h-full.w-full(
      :show="tab === Tab.Account"
      v-bind="transition"
    )
      Account.h-full

    TransitionRoot.absolute.h-full.w-full(
      :show="tab === Tab.Settings"
      v-bind="transition"
    )
      SettingsModal.h-full(:simulation)

    TransitionRoot.absolute.h-full.w-full(
      :show="tab === Tab.Library"
      v-bind="transition"
    )
      Library.h-full(@select="selectedScenarioId = $event; tab = Tab.Scenario")

  NewGameModal(
    v-if="scenario"
    :key="scenario.id"
    :open="newGameRequest !== undefined"
    :scenario
    :episode-id="newGameRequestEpisodeId ?? undefined"
    @close="newGameRequest = undefined"
    @select-episode="newGameRequestEpisodeId = $event"
  )
</template>

<style lang="postcss" scoped>
._btn {
  @apply btn btn-md rounded-lg bg-black/5 transition-transform pressable;

  &:not(._danger) {
    @apply hover:btn-primary;

    &._selected {
      @apply btn-primary;
    }
  }

  &._danger {
    @apply hover:btn-error;
  }
}
</style>

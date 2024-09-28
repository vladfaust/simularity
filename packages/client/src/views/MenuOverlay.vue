<script setup lang="ts">
import FooterVue from "@/components/Footer.vue";
import TransitionImage from "@/components/TransitionImage.vue";
import { selectedScenarioId } from "@/lib/storage";
import { useScenarioQuery } from "@/queries";
import router, { routeLocation } from "@/router";
import SavesVue from "@/views/MenuOverlay/Saves.vue";
import { TransitionRoot } from "@headlessui/vue";
import { dialog } from "@tauri-apps/api";
import { asyncComputed } from "@vueuse/core";
import {
  BrainCircuitIcon,
  DoorOpenIcon,
  HistoryIcon,
  SparkleIcon,
  User2Icon,
} from "lucide-vue-next";
import { ref } from "vue";
import Account from "./MenuOverlay/Account.vue";
import Library from "./MenuOverlay/Library.vue";
import NewGameModal from "./MenuOverlay/NewGameModal.vue";
import Scenario from "./MenuOverlay/Scenario.vue";
import SettingsModal from "./MenuOverlay/SettingsModal.vue";
import type { Simulation } from "@/lib/simulation";
import GpuStatus from "./Simulation/GpuStatus.vue";

enum Tab {
  Scenario,
  LoadGame,
  Account,
  Settings,
  Library,
}

defineProps<{
  simulation?: Simulation;
}>();

const { data: scenario } = useScenarioQuery(selectedScenarioId);
const scenarioTitle = asyncComputed(() => scenario.value?.content.name);
const scenarioLogo = asyncComputed(() =>
  scenario.value?.content.logoPath
    ? scenario.value.resourceUrl(scenario.value.content.logoPath)
    : null,
);

const tab = ref(Tab.Scenario);

/**
 * String means an episode ID.
 * Null means the default episode.
 * Undefined means no request.
 */
const newGameRequest = ref<string | null | undefined>();

const transition = {
  enter: "duration-200 ease-out",
  enterFrom: "opacity-0 transform scale-95 -translate-x-full",
  enterTo: "opacity-100 transform scale-100 translate-x-0",
  leave: "duration-200 ease-in",
  leaveFrom: "opacity-100 transform scale-100 translate-x-0",
  leaveTo: "opacity-0 transform scale-95 -translate-x-full",
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
.grid.grid-cols-4.overflow-hidden.backdrop-blur(class="lg:grid-cols-6")
  .flex.flex-col.items-center.justify-between.gap-2.border-r.p-3(class="bg-white/90")
    //- Logo button.
    button.btn.aspect-video.w-full.max-w-56.gap-2.overflow-hidden.rounded-lg.p-3.transition.pressable-sm(
      @click="tab === Tab.Scenario ? (tab = Tab.Library) : (tab = Tab.Scenario)"
      class="hover:bg-white"
    )
      .w-full(v-if="scenarioLogo")
        TransitionImage.pointer-events-none.select-none.object-contain(
          :src="scenarioLogo"
          alt="Scenario logo"
        )
      span.text-nowrap.text-lg.font-bold(v-else) {{ scenarioTitle }}

    .flex.flex-col.items-center.gap-2
      //- New game button.
      button._btn(@click="newGameRequest = null")
        SparkleIcon(:size="20")
        | New game

      //- Load game button.
      button._btn(
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
        BrainCircuitIcon(:size="20")
        | AI Settings
        GpuStatus(v-if="simulation" :simulation)

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

  .relative.col-span-3.h-full.w-full.overflow-hidden(class="bg-white/90 lg:col-span-5")
    TransitionRoot.absolute.h-full.w-full(
      :show="tab === Tab.Scenario"
      v-bind="transition"
    )
      Scenario.h-full(
        :scenario-id="selectedScenarioId"
        @back="tab = Tab.Library"
        @new-game="(e) => (newGameRequest = e ?? null)"
      )

    TransitionRoot.absolute.h-full.w-full(
      :show="tab === Tab.LoadGame"
      v-bind="transition"
    )
      SavesVue.h-full(:scenario-id="selectedScenarioId")

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
    :open="newGameRequest !== undefined"
    :scenario
    :episode-id="newGameRequest ?? undefined"
    @close="newGameRequest = undefined"
  )
</template>

<style lang="scss" scoped>
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

<script setup lang="ts">
import FooterVue from "@/components/Footer.vue";
import { selectedScenarioId } from "@/lib/storage";
import { useScenarioQuery } from "@/queries";
import router, { routeLocation } from "@/router";
import SavesVue from "@/views/MenuOverlay/Saves.vue";
import { TransitionRoot } from "@headlessui/vue";
import { dialog } from "@tauri-apps/api";
import { asyncComputed } from "@vueuse/core";
import {
  DoorOpenIcon,
  HistoryIcon,
  SettingsIcon,
  SparkleIcon,
} from "lucide-vue-next";
import { ref } from "vue";
import Library from "./MenuOverlay/Library.vue";
import Scenario from "./MenuOverlay/Scenario.vue";
import NewGameModal from "./MenuOverlay/NewGameModal.vue";
import SettingsModal from "./MenuOverlay/SettingsModal.vue";

enum Tab {
  Scenario,
  LoadGame,
  Settings,
  Library,
}

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
    button.btn.btn-pressable-sm.aspect-video.w-full.max-w-56.gap-2.overflow-hidden.rounded-lg.p-3(
      @click="tab === Tab.Scenario ? (tab = Tab.Library) : (tab = Tab.Scenario)"
      class="hover:bg-neutral-100"
    )
      .w-full(v-if="scenarioLogo")
        img.pointer-events-none.select-none.object-contain(
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
        SettingsIcon(:size="20")
        | Settings

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
      enter="duration-500 ease-out"
      enter-from="opacity-0"
      enter-to="opacity-100"
      leave="duration-200 ease-in"
      leave-from="opacity-100"
      leave-to="opacity-0"
    )
      Scenario.h-full(
        :scenario-id="selectedScenarioId"
        @back="tab = Tab.Library"
        @new-game="(e) => (newGameRequest = e ?? null)"
      )

    TransitionRoot.absolute.h-full.w-full(
      :show="tab === Tab.LoadGame"
      enter="duration-500 ease-out"
      enter-from="opacity-0"
      enter-to="opacity-100"
      leave="duration-200 ease-in"
      leave-from="opacity-100"
      leave-to="opacity-0"
    )
      SavesVue.h-full(:scenario-id="selectedScenarioId")

    TransitionRoot.absolute.h-full.w-full(
      :show="tab === Tab.Settings"
      enter="duration-500 ease-out"
      enter-from="opacity-0"
      enter-to="opacity-100"
      leave="duration-200 ease-in"
      leave-from="opacity-100"
      leave-to="opacity-0"
    )
      SettingsModal.h-full

    TransitionRoot.absolute.h-full.w-full(
      :show="tab === Tab.Library"
      enter="duration-500 ease-out"
      enter-from="opacity-0"
      enter-to="opacity-100"
      leave="duration-200 ease-in"
      leave-from="opacity-100"
      leave-to="opacity-0"
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

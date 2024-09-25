<script setup lang="ts">
import { env } from "@/env";
import { Mode, Simulation } from "@/lib/simulation";
import { useScenarioQuery } from "@/queries";
import router, { routeLocation } from "@/router";
import { dialog } from "@tauri-apps/api";
import { asyncComputed } from "@vueuse/core";
import FooterVue from "@/components/Footer.vue";
import SettingsModal from "./SettingsModal.vue";
import { ref } from "vue";
import LoadGameModal from "./LoadGameModal.vue";
import {
  DoorOpenIcon,
  HistoryIcon,
  PuzzleIcon,
  SettingsIcon,
  SparkleIcon,
} from "lucide-vue-next";

const { data: scenario } = useScenarioQuery(env.VITE_PRODUCT_ID);

const backgroundImageUrl = asyncComputed(() =>
  scenario.value?.getCoverImageUrl(),
);

const title = asyncComputed(() => scenario.value?.content.name);

const loadGameModalOpen = ref(false);
const settingModalOpen = ref(false);

async function newGame() {
  const simulationId = await Simulation.create(
    env.VITE_PRODUCT_ID,
    Mode.Immersive,
  );

  router.push(
    routeLocation({
      name: "Simulation",
      params: { simulationId },
    }),
  );
}

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
.relative.flex.h-screen
  .z-10.m-3.flex.flex-col.items-center.justify-between.gap-2.rounded-l-lg.p-3.shadow-lg.backdrop-blur(
    class="bg-white/95"
  )
    .px-3
      span.text-nowrap.text-xl.font-bold.tracking-wide {{ title }}
    .flex.flex-col.items-center.gap-2
      button._btn.group(@click="newGame")
        SparkleIcon(:size="20" class="group-hover:animate-pulse")
        | New game
      button._btn.group(@click="loadGameModalOpen = true")
        HistoryIcon(:size="20" class="group-hover:animate-pulse")
        | Load game
      button._btn.group(@click="settingModalOpen = true")
        SettingsIcon(:size="20" class="group-hover:animate-spin")
        | Settings
      RouterLink._btn.group(:to="routeLocation({ name: 'Library' })")
        PuzzleIcon(:size="20" class="group-hover:animate-pulse")
        | Extra
      button._btn._danger.group(@click="exit")
        DoorOpenIcon(:size="20" class="group-hover:animate-pulse")
        | Exit
    .px-3
      FooterVue

  img.pointer-events-none.absolute.h-full.w-full.object-cover(
    v-if="backgroundImageUrl"
    :src="backgroundImageUrl"
    alt="Background"
  )

  SettingsModal(:open="settingModalOpen" @close="settingModalOpen = false")
  LoadGameModal(:open="loadGameModalOpen" @close="loadGameModalOpen = false")
</template>

<style lang="scss" scoped>
._btn {
  @apply btn btn-md rounded-lg bg-black/5 transition-transform pressable;

  &:not(._danger) {
    @apply hover:btn-primary;
  }

  &._danger {
    @apply hover:btn-error;
  }
}
</style>

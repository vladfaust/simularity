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
.flex.h-screen
  .flex.flex-col.items-center.justify-between.gap-2.p-3
    .px-3
      span.text-nowrap.text-xl.font-bold.tracking-wide {{ title }}
    .flex.flex-col.items-center.gap-2
      button._btn(@click="newGame") New game
      button._btn(@click="loadGameModalOpen = true") Load game
      button._btn(@click="settingModalOpen = true") Settings
      RouterLink._btn(:to="routeLocation({ name: 'Library' })") Extra
      button._btn(@click="exit") Exit
    .px-3
      FooterVue

  img.pointer-events-none.h-full.w-full.object-cover(
    v-if="backgroundImageUrl"
    :src="backgroundImageUrl"
    alt="Background"
  )

  SettingsModal(:open="settingModalOpen" @close="settingModalOpen = false")
  LoadGameModal(:open="loadGameModalOpen" @close="loadGameModalOpen = false")
</template>

<style lang="scss" scoped>
._btn {
  @apply btn btn-md rounded-lg bg-black/10 transition-transform pressable;
  @apply hover:btn-primary;
}
</style>

<script setup lang="ts">
import router, { routeLocation } from "@/router";
import { Simulation } from "@/lib/simulation";
import { DefaultScene } from "@/lib/simulation/phaser/defaultScene";
import { Game } from "@/lib/simulation/phaser/game";
import { ambientVolumeStorage } from "@/lib/storage";
import { TransitionRoot } from "@headlessui/vue";
import {
  BaseDirectory,
  createDir,
  exists,
  writeBinaryFile,
} from "@tauri-apps/api/fs";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { watchImmediate } from "@vueuse/core";
import prettyBytes from "pretty-bytes";
import { onMounted, onUnmounted, ref, shallowRef } from "vue";
import DevConsole from "./Simulation/DevConsole.vue";
import GameConsole from "./Simulation/GameConsole.vue";

const { simulationId } = defineProps<{ simulationId: number }>();

let simulation = shallowRef<Simulation | undefined>();
let gameInstance: Game;
let scene: DefaultScene;

const canvasFade = ref(false);
const fullFade = ref(true);
const loadProgress = ref(0);

const showDevModal = ref(false);

function consoleEventListener(event: KeyboardEvent) {
  // Detect tilda key press on different keyboard layouts.
  // FIXME: Enable [, disable when input fields is focused.
  if (["~", "§", "`", ">"].includes(event.key)) {
    showDevModal.value = !showDevModal.value;
    event.preventDefault();
  }
}

/**
 * Fade the canvas and then execute a callback.
 */
async function fadeCanvas(callback: () => Promise<void>): Promise<void> {
  try {
    canvasFade.value = true;
    await callback();
  } finally {
    canvasFade.value = false;
  }
}

/**
 * Take a screenshot of the game, and save it at
 * `$APPLOCALDATA/screenshots/{simulationId}`.
 */
async function screenshot(
  rewrite: boolean,
): Promise<{ path: string; size: number } | null> {
  const path = await join(
    await appLocalDataDir(),
    "screenshots",
    `${simulationId}.jpg`,
  );

  if ((await exists(path)) && !rewrite) {
    return null;
  }

  const dataUri = gameInstance.screenshot("image/jpeg");
  const base64 = dataUri.split(",")[1];
  const buffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  await createDir("screenshots", {
    dir: BaseDirectory.AppLocalData,
    recursive: true,
  });
  await writeBinaryFile(path, buffer, { append: false });
  const size = buffer.length;

  console.log("Saved screenshot", path, prettyBytes(size));

  return { path, size };
}

function toMainMenu() {
  router.push(routeLocation({ name: "Home" }));
}

onMounted(async () => {
  simulation.value = await Simulation.load(simulationId);

  // REFACTOR: Scene creation shall be incapsulated.
  gameInstance = new Game();
  scene = new DefaultScene(
    simulation.value.scenario,
    simulation.value.state.stage.value,
    (progress) => {
      loadProgress.value = progress;
    },
    () => {
      fullFade.value = false;
    },
  );
  await gameInstance.createScene(scene, "default");

  // ADHOC: Hide the default character.
  scene.hideCharacter(simulation.value.scenario.defaultCharacterId);

  // Connect the simulation to the scene.
  simulation.value.setStageRenderer(scene);

  // Register a console event listener.
  window.addEventListener("keypress", consoleEventListener);

  // ADHOC: Always create a screenshot upon running a simulation,
  // because there is currently no easy way to detect
  // if there have been any real updates.
  screenshot(false);

  watchImmediate(
    () => ambientVolumeStorage.value,
    (ambientVolume) => {
      scene.ambientVolume = ambientVolume / 100;
    },
  );
});

onUnmounted(() => {
  window.removeEventListener("keypress", consoleEventListener);
  simulation.value?.destroy();
  gameInstance.destroy();
});
</script>

<template lang="pug">
.flex.h-screen.w-screen
  TransitionRoot#full-fade.absolute.top-0.z-30.grid.h-screen.w-screen.place-items-center.bg-white.p-3(
    :unmount="true"
    :show="fullFade"
    enter="transition-opacity duration-500 ease-in"
    enter-from="opacity-0"
    enter-to="opacity-100"
    leave="transition-opacity duration-500 ease-out"
    leave-from="opacity-100"
    leave-to="opacity-0"
  )
    .flex.w-full.max-w-xs.items-center.gap-1
      .w-full.rounded-lg.shadow(class="h-2.5 dark:bg-gray-700")
        .h-2.rounded-lg.bg-primary-500(
          :style="{ width: `${loadProgress * 100}%` }"
        )
      span {{ Math.round(loadProgress * 100) }}%
  .relative.flex.h-full.w-full.justify-center.overflow-hidden
    .relative.h-full.w-full
      TransitionRoot#canvas-fade.absolute.top-0.z-10.h-screen.w-screen.bg-black(
        :unmount="true"
        :show="canvasFade"
        enter="transition-opacity duration-500 ease-in"
        enter-from="opacity-0"
        enter-to="opacity-100"
        leave="transition-opacity duration-500 ease-out"
        leave-from="opacity-100"
        leave-to="opacity-0"
      )

      #game-screen.h-full.w-full

    .absolute.top-0.z-20.flex.h-full.w-full.flex-col.items-center.justify-end.p-2
      GameConsole(
        v-if="simulation"
        :simulation
        :fade-canvas
        :screenshot
        @main-menu="toMainMenu"
        @screenshot="screenshot"
      )

  DevConsole(
    v-if="simulation"
    :open="showDevModal"
    :simulation
    @close="showDevModal = false"
  )
</template>

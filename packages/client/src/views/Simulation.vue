<script setup lang="ts">
import Modal from "@/components/Modal.vue";
import { trackEvent, trackPageview } from "@/lib/plausible";
import type { LocalImmersiveScenario } from "@/lib/scenario";
import { Mode, Simulation } from "@/lib/simulation";
import { DefaultScene } from "@/lib/simulation/phaser/defaultScene";
import { Game } from "@/lib/simulation/phaser/game";
import { ambientVolumeStorage, selectedScenarioId } from "@/lib/storage";
import { nonNullable } from "@/lib/utils";
import { TransitionRoot } from "@headlessui/vue";
import * as tauriPath from "@tauri-apps/api/path";
import * as tauriFs from "@tauri-apps/plugin-fs";
import { asyncComputed, watchImmediate } from "@vueuse/core";
import prettyBytes from "pretty-bytes";
import { onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import MenuOverlay, { type Tab as MainMenuTab } from "./MenuOverlay.vue";
import DevConsole from "./Simulation/DevConsole.vue";
import GameConsole from "./Simulation/GameConsole.vue";

const props = defineProps<{ simulationId: string }>();
const simulationId = Number(props.simulationId);

let simulation = shallowRef<Simulation | undefined>();
let gameInstance: Game;
let scene: DefaultScene | undefined;

const canvasFade = ref(false);
const fullFade = ref(true);
const mainMenu = ref(false);
const mainMenuTab = ref<MainMenuTab | undefined>();
const loadProgress = ref(0);

const showDevModal = ref(false);
const scenarioCoverUrl = asyncComputed(() =>
  simulation.value?.scenario.getCoverImageUrl(),
);

function keypressEventListener(event: KeyboardEvent) {
  // Detect tilda key press on different keyboard layouts.
  // FIXME: Enable [, disable when input fields is focused.
  if (
    !mainMenu.value &&
    simulation.value?.mode === Mode.Immersive &&
    ["~", "§", "`", ">"].includes(event.key)
  ) {
    showDevModal.value = !showDevModal.value;
    event.preventDefault();
  }
}

/**
 * Fade the canvas and then execute a callback.
 */
async function fadeCanvas(callback: () => Promise<void>): Promise<void> {
  try {
    if (simulation.value?.mode === Mode.Immersive) {
      canvasFade.value = true;
    }

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
  const path = await tauriPath.join(
    await tauriPath.appLocalDataDir(),
    "screenshots",
    `${simulationId}.jpg`,
  );

  if ((await tauriFs.exists(path)) && !rewrite) {
    return null;
  }

  const dataUri = gameInstance.screenshot("image/jpeg");
  const base64 = dataUri.split(",")[1];
  const buffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  await tauriFs.mkdir("screenshots", {
    baseDir: tauriFs.BaseDirectory.AppLocalData,
    recursive: true,
  });
  await tauriFs.writeFile(path, buffer, { append: false });
  const size = buffer.length;

  console.log("Saved screenshot", path, prettyBytes(size));

  return { path, size };
}

onMounted(async () => {
  simulation.value = await Simulation.load(simulationId);

  if (simulation.value.mode === Mode.Immersive) {
    // REFACTOR: Scene creation shall be incapsulated.
    gameInstance = new Game();
    scene = new DefaultScene(
      simulation.value.scenario as LocalImmersiveScenario,
      simulation.value.state!.stage.value,
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

    // ADHOC: Always create a screenshot upon running a simulation,
    // because there is currently no easy way to detect
    // if there have been any real updates.
    screenshot(false);

    watchImmediate(
      () => ambientVolumeStorage.value,
      (ambientVolume) => {
        if (!scene || mainMenu.value) return;
        scene.ambientVolume = ambientVolume / 100;
      },
    );
  } else {
    fullFade.value = false;
  }

  window.addEventListener("keypress", keypressEventListener);

  trackEvent("simulations/load", {
    props: {
      simulationId,
      scenarioId: simulation.value.scenarioId,
      immersive: simulation.value.mode === Mode.Immersive,
      sandbox: simulation.value.sandbox,
    },
  });

  trackPageview("/simulation");
});

watch(mainMenu, (value) => {
  if (!scene) return;

  if (value) {
    scene.ambientVolume = 0;
  } else {
    scene.ambientVolume = ambientVolumeStorage.value / 100;
  }
});

onUnmounted(() => {
  if (simulation.value?.mode === Mode.Immersive) {
    window.removeEventListener("keypress", keypressEventListener);
    gameInstance.destroy();
  }

  simulation.value?.destroy();
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
    .relative.h-full.w-full.bg-neutral-100
      img.absolute.top-0.h-full.w-full.object-cover.blur(
        v-if="simulation?.mode !== Mode.Immersive && scenarioCoverUrl"
        :src="scenarioCoverUrl"
      )

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
        :inactive="canvasFade || mainMenu"
        @main-menu="mainMenu = true"
        @dev-console="showDevModal = true"
        @screenshot="screenshot"
      )

    Modal.h-full.w-full.rounded-lg.shadow-lg(
      :open="mainMenu"
      @close="mainMenu = false; selectedScenarioId = nonNullable(simulation?.scenarioId)"
    )
      MenuOverlay.h-full.w-full(
        :simulation
        :tab="mainMenuTab"
        @back-to-game="mainMenu = false"
        @tab-change="mainMenuTab = $event"
      )

  DevConsole(
    v-if="simulation"
    :open="showDevModal"
    :simulation
    @close="showDevModal = false"
  )
</template>

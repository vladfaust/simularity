<script setup lang="ts">
import router, { routeLocation } from "@/lib/router";
import { Simulation } from "@/lib/simulation";
import { DefaultScene } from "@/lib/simulation/phaser/defaultScene";
import { Game } from "@/lib/simulation/phaser/game";
import { TransitionRoot } from "@headlessui/vue";
import {
  BaseDirectory,
  createDir,
  exists,
  writeBinaryFile,
} from "@tauri-apps/api/fs";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { MenuIcon, ShapesIcon, XIcon } from "lucide-vue-next";
import prettyBytes from "pretty-bytes";
import { computed, onMounted, onUnmounted, ref, shallowRef } from "vue";
import DeveloperConsole from "./Simulation/DeveloperConsole.vue";
import GameConsole from "./Simulation/GameConsole.vue";
import Menu from "./Simulation/Menu.vue";
import SandboxConsole from "./Simulation/SandboxConsole.vue";

const { simulationId } = defineProps<{ simulationId: string }>();

let simulation = shallowRef<Simulation | undefined>();
let gameInstance: Game;
let scene: DefaultScene;

const assetBaseUrl = ref<URL | undefined>();
const canvasFade = ref(true);

const showConsoleModal = ref(false);
const showSandboxConsole = ref(false);
const showMenu = ref(false);

// FIXME: Proper episode display.
const currentEpisodeConsoleObject = computed(() =>
  simulation.value?.state.currentEpisode.value
    ? {
        id: simulation.value?.state.currentEpisode.value.id,
        chunks: {
          current:
            simulation.value?.state.currentEpisode.value.nextChunkIndex - 1,
          total: simulation.value?.state.currentEpisode.value.totalChunks,
        },
      }
    : null,
);

function consoleEventListener(event: KeyboardEvent) {
  // Detect tilda key press on different keyboard layouts.
  // FIXME: Enable [, disable when input fields is focused.
  if (["~", "§", "`", ">"].includes(event.key)) {
    showConsoleModal.value = !showConsoleModal.value;
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
  router.push(routeLocation({ name: "MainMenu" }));
}

onMounted(async () => {
  simulation.value = await Simulation.load(simulationId);

  assetBaseUrl.value = new URL(
    `/scenarios/${simulation.value.scenarioId}/`,
    window.location.origin,
  );

  // REFACTOR: Scene creation shall be incapsulated.
  gameInstance = new Game();
  scene = new DefaultScene(
    simulation.value.scenario,
    assetBaseUrl.value.toString(),
    simulation.value.state.stage.value,
    () => (canvasFade.value = false),
  );
  await gameInstance.createScene(scene, "default");

  // Connect the simulation to the scene.
  simulation.value.setStageRenderer(scene);

  // Register a console event listener.
  window.addEventListener("keypress", consoleEventListener);

  // ADHOC: Always create a screenshot upon running a simulation,
  // because there is currently no easy way to detect
  // if there have been any real updates.
  screenshot(false);
});

onUnmounted(() => {
  window.removeEventListener("keypress", consoleEventListener);
});
</script>

<template lang="pug">
.flex.h-screen.w-screen
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

    .absolute.top-0.z-20.flex.h-full.w-full.flex-col.items-center.gap-2
      //- Top buttons.
      .flex.w-full.justify-between.gap-2.px-2.pt-2
        button.rounded-lg.bg-black.bg-opacity-50.px-2.py-1.shadow.transition-transform.pressable(
          @click="showMenu = !showMenu"
        )
          MenuIcon.text-white(:size="20")

        button.rounded-lg.bg-black.bg-opacity-50.px-2.py-1.shadow.transition-transform.pressable(
          @click="showSandboxConsole = !showSandboxConsole"
        )
          ShapesIcon.text-white(v-if="!showSandboxConsole" :size="20")
          XIcon.text-white(v-else :size="20")

      GameConsole(v-if="simulation" :simulation :fade-canvas :screenshot)

  TransitionRoot.h-full.shrink-0(
    class="w-1/3"
    :unmount="true"
    :show="showSandboxConsole"
    enter="transition duration-200 ease-in"
    enter-from="opacity-0 translate-x-full"
    enter-to="opacity-100 translate-x-0"
    leave="transition duration-200 ease-out"
    leave-from="opacity-100 translate-x-0"
    leave-to="opacity-0 translate-x-full"
  )
    SandboxConsole.h-full(
      v-if="simulation?.scenario && assetBaseUrl"
      :asset-base-url="assetBaseUrl"
      :scenario="simulation.scenario"
      :state="simulation.state"
    )

  DeveloperConsole(
    :open="showConsoleModal"
    :writer="simulation?.writer.value"
    :committed-writer-prompt="simulation?.committedWriterPrompt.value ?? ''"
    :uncommitted-writer-prompt="simulation?.uncommittedWriterPrompt.value ?? ''"
    :temp-writer-prompt="simulation?.tempWriterPrompt.value ?? ''"
    :episode="currentEpisodeConsoleObject"
    :stage-state-delta="simulation?.previousStateDelta.value ?? []"
    @close="showConsoleModal = false"
  )

  Menu(:open="showMenu" @close="showMenu = false" @to-main-menu="toMainMenu")
</template>

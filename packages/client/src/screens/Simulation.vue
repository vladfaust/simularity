<script setup lang="ts">
import router, { routeLocation } from "@/lib/router";
import { type InferenceOptions } from "@/lib/simularity/common";
import { Simulation } from "@/lib/simulation";
import { DefaultScene } from "@/lib/simulation/phaser/defaultScene";
import { Game } from "@/lib/simulation/phaser/game";
import {
  AssistantUpdate,
  EpisodeUpdate,
  UserUpdate,
} from "@/lib/simulation/updates";

import { TransitionRoot } from "@headlessui/vue";
import {
  BaseDirectory,
  createDir,
  exists,
  writeBinaryFile,
} from "@tauri-apps/api/fs";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { useInfiniteScroll, useScroll } from "@vueuse/core";
import {
  Loader2Icon,
  MenuIcon,
  SendHorizontalIcon,
  ShapesIcon,
  SkipForwardIcon,
  SquareIcon,
  XIcon,
} from "lucide-vue-next";
import prettyBytes from "pretty-bytes";
import { computed, onMounted, onUnmounted, ref } from "vue";

import AssistantUpdateVue from "./Simulation/AssistantUpdate.vue";
import DeveloperConsole from "./Simulation/DeveloperConsole.vue";
import EpisodeUpdateVue from "./Simulation/EpisodeUpdate.vue";
import GptStatus from "./Simulation/GptStatus.vue";
import Menu from "./Simulation/Menu.vue";
import SandboxConsole from "./Simulation/SandboxConsole.vue";
import UserUpdateVue from "./Simulation/UserUpdate.vue";
import { shallowRef } from "vue";

const { simulationId } = defineProps<{ simulationId: string }>();

let simulation = shallowRef<Simulation | undefined>();
let gameInstance: Game;
let scene: DefaultScene;

const assetBaseUrl = ref<URL | undefined>();

/**
 * A generic busy state, e.g. when saving updates to the database.
 */
const busy = ref(false);

/**
 * Whether the AI is currently inferring.
 */
const inferenceAbortController = ref<AbortController | null>(null);

/**
 * Inference decoding progress, from 0 to 1, if inferring.
 */
const inferenceDecodingProgress = ref<number | undefined>();

const _canvasFade = ref(true);

const consoleModal = ref(false);

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

const showSandboxConsole = ref(false);
const showMenu = ref(false);

const playerInput = ref("");
const userInputEnabled = computed(
  () =>
    simulation.value &&
    !busy.value &&
    !simulation.value.state.shallAdvanceEpisode.value,
);

const updatesScrollOffsetY = ref(0);
const updatesRef = ref<HTMLElement | null>(null);
useInfiniteScroll(updatesRef, () => {}, {
  direction: "top",
});
useScroll(updatesRef, {
  onScroll(e) {
    updatesScrollOffsetY.value = (e.target as HTMLDivElement).scrollTop;
  },
});

const modelSettings = ref<InferenceOptions>({
  minP: 0.1,
  mirostat: {
    version: "v1",
    tau: 5,
    eta: 0.1,
  },
});

const sendButtonState = computed(() => {
  if (inferenceAbortController.value) {
    if (inferenceDecodingProgress.value === 1) {
      return "inferring";
    } else {
      return "inferenceDecoding";
    }
  } else {
    if (playerInput.value) return "sendMessage";
    if (busy.value) return "busy";
    return "skip";
  }
});

function progressCallback(eventName: string) {
  return (event: { progress: number }) => {
    const progress = Math.round(event.progress * 100);
    console.log(`${eventName}: ${progress}%`);
  };
}

function consoleEventListener(event: KeyboardEvent) {
  // Detect tilda key press on different keyboard layouts.
  // FIXME: Enable [, disable when input fields is focused.
  if (["~", "§", "`", ">"].includes(event.key)) {
    consoleModal.value = !consoleModal.value;
    event.preventDefault();
  }
}

/**
 * Fade the canvas and then execute a callback.
 */
async function fadeCanvas(callback: () => Promise<void>): Promise<void> {
  try {
    _canvasFade.value = true;
    await callback();
  } finally {
    _canvasFade.value = false;
  }
}

/**
 * Explicitly regenerate an assistant update.
 */
async function regenerateAssistantUpdate(regeneratedUpdate: AssistantUpdate) {
  if (!simulation.value) {
    throw new Error("Simulation is not ready");
  }

  inferenceAbortController.value = new AbortController();
  inferenceDecodingProgress.value = 0;

  try {
    await simulation.value.createAssistantUpdateVariant(
      regeneratedUpdate,
      fadeCanvas,
      128,
      modelSettings.value,
      (e) => (inferenceDecodingProgress.value = e.progress),
      inferenceAbortController.value!.signal,
    );
  } finally {
    inferenceDecodingProgress.value = undefined;
    inferenceAbortController.value = null;
  }
}

/**
 * Send player message to the chat.
 * The message may be edited, so is not committed to GPT yet.
 */
async function sendPlayerMessage() {
  if (!simulation.value) {
    throw new Error("Simulation is not ready");
  }

  let userMessage = playerInput.value;
  if (!userMessage) {
    throw new Error("Empty player input");
  }

  playerInput.value = "";
  let wouldRestorePlayerInput = true;

  busy.value = true;
  inferenceAbortController.value = new AbortController();
  inferenceDecodingProgress.value = 0;
  try {
    await simulation.value.createUserUpdate(
      userMessage,
      128,
      modelSettings.value,
      (e) => (inferenceDecodingProgress.value = e.progress),
      inferenceAbortController.value!.signal,
    );
  } catch (e) {
    if (wouldRestorePlayerInput) {
      playerInput.value = userMessage;
    }

    throw e;
  } finally {
    inferenceDecodingProgress.value = undefined;
    inferenceAbortController.value = null;
    busy.value = false;
  }
}

/**
 * Move the story forward by either applying an episode update,
 * or by predicting the next update from the latent space.
 */
async function advance() {
  if (!simulation.value) {
    throw new Error("Simulation is not ready");
  }

  if (playerInput.value) {
    throw new Error("To advance, player input must be empty");
  }

  busy.value = true;
  try {
    if (simulation.value.state.currentEpisode.value) {
      await simulation.value.advanceCurrentEpisode(
        progressCallback("Decoding"),
      );
    } else {
      inferenceAbortController.value = new AbortController();

      await simulation.value.createAssistantUpdate(
        128,
        modelSettings.value,
        (e) => (inferenceDecodingProgress.value = e.progress),
        inferenceAbortController.value!.signal,
      );
    }
  } finally {
    inferenceDecodingProgress.value = undefined;
    inferenceAbortController.value = null;
    busy.value = false;
  }

  screenshot(true).then((shot) => {
    if (shot) {
      console.log("Saved screenshot", shot.path, prettyBytes(shot.size));
    }
  });
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

  return { path, size: buffer.length };
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
    () => (_canvasFade.value = false),
  );
  await gameInstance.createScene(scene, "default");

  // Connect the simulation to the scene.
  simulation.value.setStageRenderer(scene);

  // Register a console event listener.
  window.addEventListener("keypress", consoleEventListener);

  // ADHOC: Always create a screenshot upon running a simulation,
  // because there is currently no easy way to detect
  // if there have been any real updates.
  screenshot(false).then((shot) => {
    if (shot) {
      console.log("Saved screenshot", shot.path, prettyBytes(shot.size));
    }
  });
});

onUnmounted(() => {
  window.removeEventListener("keypress", consoleEventListener);
});

function chooseAssistantVariant(update: AssistantUpdate, variantIndex: number) {
  if (!simulation.value) {
    throw new Error("Simulation is not ready");
  }

  simulation.value.chooseAssistantUpdateVariant(
    update,
    variantIndex,
    fadeCanvas,
  );
}

async function onUserUpdateEdit(update: UserUpdate, newText: string) {
  if (!simulation.value) {
    throw new Error("Simulation is not ready");
  }

  busy.value = true;
  inferenceAbortController.value = new AbortController();
  inferenceDecodingProgress.value = 0;

  try {
    await simulation.value.editUserUpdateText(update, newText);
  } finally {
    inferenceDecodingProgress.value = undefined;
    inferenceAbortController.value = null;
    busy.value = false;
  }
}

async function onAssistantUpdateEdit(update: AssistantUpdate, newText: string) {
  if (!simulation.value) {
    throw new Error("Simulation is not ready");
  }

  try {
    busy.value = true;
    await simulation.value.editAssistantUpdateVariantText(update, newText);
  } finally {
    busy.value = false;
  }
}

function toMainMenu() {
  router.push(routeLocation({ name: "MainMenu" }));
}

async function onSendButtonClick() {
  if (inferenceAbortController.value) {
    inferenceAbortController.value.abort();
    inferenceAbortController.value = null;
  } else if (!busy.value) {
    if (playerInput.value) {
      await sendPlayerMessage();
    } else {
      await advance();
    }
  }
}
</script>

<template lang="pug">
.flex.h-screen.w-screen
  .relative.flex.h-full.w-full.justify-center.overflow-hidden
    .relative.h-full.w-full
      TransitionRoot#canvas-fade.absolute.top-0.z-10.h-screen.w-screen.bg-black(
        :unmount="true"
        :show="_canvasFade"
        enter="transition-opacity duration-500 ease-in"
        enter-from="opacity-0"
        enter-to="opacity-100"
        leave="transition-opacity duration-500 ease-out"
        leave-from="opacity-100"
        leave-to="opacity-0"
      )

      #game-screen.h-full.w-full

    .absolute.top-0.z-20.flex.h-full.w-full.flex-col.items-center.gap-2
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

      .flex.h-full.w-full.max-w-xl.grow.flex-col.justify-end.gap-2.overflow-hidden.px-2
        ._updates-container.flex.w-full.flex-col-reverse.gap-2.overflow-y-scroll(
          ref="updatesRef"
          :style="{ '-webkit-mask-size': `100% calc(100% - ${updatesScrollOffsetY}px)`, 'max-height': `40%` }"
        )
          template(
            v-for="update, i of simulation?.updates.value"
            :key="update.parentId"
          )
            AssistantUpdateVue(
              v-if="AssistantUpdate.is(update)"
              :update="update"
              :can-regenerate="i === 0"
              :can-edit="i === 0"
              :show-variant-navigation="i === 0"
              @regenerate="regenerateAssistantUpdate(update)"
              @edit="(newText) => onAssistantUpdateEdit(update, newText)"
              @choose-variant="(variantIndex) => chooseAssistantVariant(update, variantIndex)"
            )
            UserUpdateVue(
              v-else-if="UserUpdate.is(update)"
              :update="update"
              :can-edit="i === 0 || i === 1"
              :show-variant-navigation="i === 0 || i === 1"
              @edit="(newText) => onUserUpdateEdit(update, newText)"
            )
            EpisodeUpdateVue(
              v-else-if="EpisodeUpdate.is(update)"
              :update="update"
            )

        .h-12.w-full
          .flex.h-full.gap-2.rounded
            input.h-full.w-full.rounded-lg.px-3.shadow-lg(
              v-model="playerInput"
              placeholder="Player input"
              :disabled="!userInputEnabled"
              class="disabled:opacity-50"
              @keydown.enter.exact="playerInput ? sendPlayerMessage() : advance()"
            )

            button.relative.grid.aspect-square.h-full.place-items-center.rounded-lg.bg-white.shadow-lg.transition.pressable(
              @click="onSendButtonClick"
              :disabled="busy && !inferenceAbortController"
            )
              //- REFACTOR: Make a component for such multi-state animations.
              TransitionRoot.absolute(
                :show="sendButtonState === 'inferring' || sendButtonState === 'inferenceDecoding'"
                enter="duration-100 ease-out"
                enter-from="scale-0 opacity-0"
                enter-to="scale-100 opacity-100"
                leave="duration-100 ease-in"
                leave-from="scale-100 opacity-100"
                leave-to="scale-0 opacity-0"
              )
                .relative.grid.h-full.w-full.place-items-center
                  Loader2Icon.absolute.animate-spin(:size="30")
                  SquareIcon.absolute.fill-inherit(:size="10")
              TransitionRoot.absolute(
                :show="sendButtonState === 'busy'"
                enter="duration-100 ease-out"
                enter-from="scale-0 opacity-0"
                enter-to="scale-100 opacity-100"
                leave="duration-100 ease-in"
                leave-from="scale-100 opacity-100"
                leave-to="scale-0 opacity-0"
              )
                Loader2Icon.animate-spin(:size="20")
              TransitionRoot.absolute(
                :show="sendButtonState === 'sendMessage'"
                enter="duration-100 ease-out"
                enter-from="scale-0 opacity-0"
                enter-to="scale-100 opacity-100"
                leave="duration-100 ease-in"
                leave-from="scale-100 opacity-100"
                leave-to="scale-0 opacity-0"
              )
                SendHorizontalIcon(:size="20")
              TransitionRoot.absolute(
                :show="sendButtonState === 'skip'"
                enter="duration-100 ease-out"
                enter-from="scale-0 opacity-0"
                enter-to="scale-100 opacity-100"
                leave="duration-100 ease-in"
                leave-from="scale-100 opacity-100"
                leave-to="scale-0 opacity-0"
              )
                SkipForwardIcon(:size="20")

      .flex.w-full.justify-center.bg-white.bg-opacity-25.p-2
        .flex.items-center.gap-1
          GptStatus(:gpt="simulation?.writer.value" name="Writer")

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
    :open="consoleModal"
    :writer="simulation?.writer.value"
    :writer-prompt="simulation?.committedWriterPrompt.value || ''"
    :uncommitted-writer-prompt="simulation?.uncommittedWriterPayload.value || ''"
    :episode="currentEpisodeConsoleObject"
    :stage-state-delta="simulation?.previousStateDelta.value || []"
    @close="consoleModal = false"
  )

  Menu(:open="showMenu" @close="showMenu = false" @to-main-menu="toMainMenu")
</template>

<style lang="scss" scoped>
._updates-container {
  mask-image: -webkit-gradient(
    linear,
    left top,
    left bottom,
    color-stop(0%, rgba(0, 0, 0, 0)),
    color-stop(50%, rgba(0, 0, 0, 1))
  );

  mask-repeat: no-repeat;
  mask-position: 0 100%;
}
</style>

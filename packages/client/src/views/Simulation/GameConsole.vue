<script setup lang="ts">
import { type CompletionOptions } from "@/lib/ai/llm/BaseLlmDriver";
import * as api from "@/lib/api";
import { trackEvent } from "@/lib/plausible";
import { Mode, Simulation } from "@/lib/simulation";
import {
  NARRATOR,
  type PredictionOptions,
} from "@/lib/simulation/agents/writer";
import { writerNEval } from "@/lib/storage/llm";
import { translationWithFallback } from "@/logic/i18n";
import { TransitionRoot } from "@headlessui/vue";
import { StorageSerializers, useLocalStorage } from "@vueuse/core";
import {
  CameraIcon,
  ChevronUpIcon,
  Loader2Icon,
  MenuIcon,
  RedoDotIcon,
  SendHorizontalIcon,
  ShapesIcon,
  SparklesIcon,
  UndoDotIcon,
} from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref, triggerRef, watch } from "vue";
import { toast } from "vue3-toastify";
import PredictionOptionsPanel from "./GameConsole/PredictionOptionsPanel.vue";
import ProgressBar from "./GameConsole/ProgressBar.vue";
import GpuStatus from "./GpuStatus.vue";
import UpdateVue from "./Update.vue";
import UpdatesHistory from "./UpdatesHistory.vue";

enum SendButtonState {
  Busy,
  WillSendMessage,
  WillGoForward,
  WillPredict,
}

const props = defineProps<{
  simulation: Simulation;
  fadeCanvas: (callback: () => Promise<void>) => Promise<void>;
  screenshot: (rewrite: boolean) => Promise<any>;
  inactive: boolean;
}>();

const { simulation, fadeCanvas, screenshot } = props;
const inactive = ref(props.inactive);

watch(
  () => props.inactive,
  (value) => (inactive.value = value),
);

const emit = defineEmits<{
  (event: "mainMenu"): void;
  (event: "devConsole"): void;
}>();

const modelSettings = ref<CompletionOptions>({
  minP: 0.1,
  mirostat: {
    version: "v1",
    tau: 5,
    eta: 0.1,
  },
  penalty: {
    lastN: 256,
    repeat: 1.05,
  },
  temp: 0.8,
});

const userInput = ref("");
const userInputEnabled = computed(
  () => !busy.value && simulation.canCreateUserUpdate.value,
);

/**
 * A generic busy state, e.g. when saving updates to the database.
 */
const busy = ref(false);

/**
 * Whether the AI is currently inferring.
 */
const inferenceAbortController = ref<AbortController | null>(null);

/**
 * Whether the updates are displayed in fullscreen.
 */
const updatesFullscreen = ref(false);

const predictionOptions = computed<PredictionOptions>(() => ({
  allowedCharacterIds: Array.from(enabledCharacterIds.value),
}));

const sendButtonState = computed<SendButtonState>(() => {
  if (simulation.busy.value) {
    return SendButtonState.Busy;
  } else {
    if (userInput.value) {
      return SendButtonState.WillSendMessage;
    } else if (
      simulation.shallAdvanceEpisode.value ||
      simulation.canGoForward.value
    ) {
      return SendButtonState.WillGoForward;
    } else {
      return SendButtonState.WillPredict;
    }
  }
});

const enabledCharacterIds = useLocalStorage<Set<string>>(
  `simulation:${simulation.id}:enabledCharacterIds`,
  new Set([...Object.keys(simulation.scenario.content.characters), NARRATOR]),
  {
    serializer: StorageSerializers.set,
  },
);

const enabledCharacterIdsSortedArray = computed(() =>
  Array.from(enabledCharacterIds.value).sort(),
);

const inputPlaceholder = computed(
  () =>
    `Speak as ${translationWithFallback(simulation.scenario.defaultCharacter.name, simulation.locale)}`,
);

const userInputElement = ref<HTMLInputElement | null>(null);

// Thanks: https://stackoverflow.com/a/53059914/3645337.
let triggerEditHandler: () => void | undefined;
let triggerPreviousVariantHandler: () => void | undefined;
let triggerNextVariantHandler: () => void | undefined;

const isEditing = ref(false);

function onSendButtonClick() {
  if (inferenceAbortController.value) {
    // Abort inference.
    inferenceAbortController.value.abort();
    inferenceAbortController.value = null;
  } else if (!busy.value) {
    if (userInput.value) sendMessage();
    else advance();
  } else {
    console.warn("Busy, cannot send message");
  }
}

/**
 * Send user message to the chat.
 */
async function sendMessage() {
  let userMessage = userInput.value;
  if (!userMessage) throw new Error("Empty user input");

  userInput.value = "";
  let wouldRestoreUserInput = true;

  busy.value = true;
  inferenceAbortController.value = new AbortController();

  try {
    await simulation.createUpdate(
      simulation.scenario.defaultCharacterId,
      userMessage,
    );

    wouldRestoreUserInput = false;

    await simulation.predictUpdate(
      writerNEval.value,
      predictionOptions.value,
      modelSettings.value,
      inferenceAbortController.value!.signal,
    );

    trackEvent("simulations/sendUserUpdate", {
      props: {
        simulationId: simulation.id,
        scenarioId: simulation.scenario.id,
        immersive: simulation.mode === Mode.Immersive,
        sandbox: simulation.sandbox,
        enabledCharacterIds: Array.from(enabledCharacterIds.value).join(","),
      },
    });
  } catch (e) {
    if (wouldRestoreUserInput) {
      userInput.value = userMessage;
    }

    if (e instanceof api.UnauthorizedError) {
      console.warn(e);
      toast.error("Please log in.");
    } else if (e instanceof api.PaymentRequiredError) {
      console.warn(e);
      toast.error("Not enough credits.");
    } else {
      throw e;
    }
  } finally {
    inferenceAbortController.value = null;
    busy.value = false;
  }
}

/**
 * Move the story forward by either applying an episode update,
 * or by predicting the next update from the latent space.
 */
async function advance() {
  if (userInput.value) {
    throw new Error("To advance, user input must be empty");
  }

  busy.value = true;
  try {
    if (
      simulation.shallAdvanceEpisode.value &&
      !simulation.canGoForward.value
    ) {
      await simulation.advanceCurrentEpisode(enabledCharacterIds);

      trackEvent("simulations/advanceEpisode", {
        props: {
          simulationId: simulation.id,
          scenarioId: simulation.scenario.id,
          immersive: simulation.mode === Mode.Immersive,
          sandbox: simulation.sandbox,
        },
      });
    } else {
      if (simulation.canGoForward.value) {
        await simulation.goForward();
      } else {
        inferenceAbortController.value = new AbortController();

        await simulation.predictUpdate(
          writerNEval.value,
          predictionOptions.value,
          modelSettings.value,
          inferenceAbortController.value!.signal,
        );

        trackEvent("simulations/generateUpdate", {
          props: {
            simulationId: simulation.id,
            scenarioId: simulation.scenario.id,
            immersive: simulation.mode === Mode.Immersive,
            sandbox: simulation.sandbox,
            enabledCharacterIds: enabledCharacterIdsSortedArray.value.join(","),
            writerModelId: simulation.writer.llmDriver.value!.modelId,
            voicerModelId: simulation.voicer.ttsDriver.value?.modelId ?? "",
          },
        });
      }
    }
  } catch (e: any) {
    if (e instanceof api.UnauthorizedError) {
      console.warn(e);
      toast.error("Please log in.");
    } else if (e instanceof api.PaymentRequiredError) {
      console.warn(e);
      toast.error("Not enough credits.");
    } else {
      throw e;
    }
  } finally {
    inferenceAbortController.value = null;
    busy.value = false;
  }

  if (simulation.mode === Mode.Immersive) {
    screenshot(true);
  }
}

/**
 * Choose a variant of an update.
 */
function chooseUpdateVariant(updateIndex: number, variantIndex: number) {
  fadeCanvas(async () => {
    if (updateIndex !== simulation.currentUpdateIndex.value) {
      await simulation.jumpToIndex(updateIndex);
    }

    await simulation.chooseCurrentUpdateVariant(variantIndex);
  });
}

/**
 * Edit an update variant.
 */
async function onUpdateVariantEdit(
  updateIndex: number,
  variantIndex: number,
  newText: string,
) {
  const update = simulation.updates.value[updateIndex];
  if (!update) throw new Error("Update not found");

  const variant = update.variants.value[variantIndex];
  if (!variant) throw new Error("Variant not found");

  if (busy.value) throw new Error("Already busy");
  busy.value = true;

  try {
    await simulation.editUpdateVariant(variant, newText);
    triggerRef(update.variants);

    trackEvent("simulations/editUpdate", {
      props: {
        simulationId: simulation.id,
        scenarioId: simulation.scenario.id,
        immersive: simulation.mode === Mode.Immersive,
      },
    });
  } finally {
    busy.value = false;
  }
}

/**
 * Explicitly regenerate an update.
 */
async function regenerateUpdate(updateIndex: number) {
  if (busy.value) throw new Error("Already busy");
  busy.value = true;

  inferenceAbortController.value = new AbortController();

  try {
    if (updateIndex !== simulation.currentUpdateIndex.value) {
      await fadeCanvas(async () => {
        await simulation.jumpToIndex(updateIndex);
      });
    }

    await simulation.predictCurrentUpdateVariant(
      writerNEval.value,
      predictionOptions.value,
      modelSettings.value,
      inferenceAbortController.value!.signal,
    );

    trackEvent("simulations/regenerateUpdate", {
      props: {
        simulationId: simulation.id,
        scenarioId: simulation.scenario.id,
        immersive: simulation.mode === Mode.Immersive,
        enabledCharacterIds: enabledCharacterIdsSortedArray.value.join(","),
        writerModelId: simulation.writer.llmDriver.value!.modelId,
        voicerModelId: simulation.voicer.ttsDriver.value?.modelId ?? "",
      },
    });
  } catch (e) {
    if (e instanceof api.UnauthorizedError) {
      console.warn(e);
      toast.error("Please log in.");
    } else if (e instanceof api.PaymentRequiredError) {
      console.warn(e);
      toast.error("Not enough credits.");
    } else {
      throw e;
    }
  } finally {
    inferenceAbortController.value = null;
    busy.value = false;
  }
}

function switchUpdatesFullscreen() {
  updatesFullscreen.value = !updatesFullscreen.value;
}

function switchEnabledCharacter(characterId: string) {
  if (enabledCharacterIds.value.has(characterId)) {
    console.debug("Disabling character", characterId);
    enabledCharacterIds.value.delete(characterId);
  } else {
    console.debug("Enabling character", characterId);
    enabledCharacterIds.value.add(characterId);
  }
}

function enableOnlyCharacter(characterId: string) {
  // If the character is already the only one enabled, select all except them.
  if (
    enabledCharacterIds.value.size === 1 &&
    enabledCharacterIds.value.has(characterId)
  ) {
    console.debug("Disabling all characters except", characterId);
    enabledCharacterIds.value = new Set([
      ...Object.keys(simulation.scenario.content.characters).filter(
        (id) => id !== characterId,
      ),
      NARRATOR,
    ]);
  } else {
    // Otherwise, enable only the selected character.
    console.debug("Enabling only character", characterId);
    enabledCharacterIds.value = new Set([characterId]);
  }
}

function onKeypress(event: KeyboardEvent) {
  if (inactive.value || isEditing.value) {
    return;
  }

  if (event.key === "Enter") {
    if (document.activeElement !== userInputElement.value) {
      if (userInput.value) sendMessage();
      else advance();
    }
  } else if (event.key === "e") {
    if (document.activeElement !== userInputElement.value) {
      if (simulation.sandbox) {
        event.preventDefault();
        triggerEditHandler?.();
      } else {
        console.warn("Editing is disabled in non-sandbox mode");
      }
    }
  } else if (event.key === "h") {
    if (document.activeElement !== userInputElement.value) {
      event.preventDefault();
      switchUpdatesFullscreen();
    }
  } else if (event.key === " ") {
    // If not currently focused on the input, focus on it.
    if (document.activeElement !== userInputElement.value) {
      event.preventDefault();
      userInputElement.value?.focus();
    }
  } else if (event.key === "Escape") {
    if (document.activeElement === userInputElement.value) {
      // Unfocus the input.
      userInputElement.value?.blur();
    } else {
      // Call the main menu handler.
      emit("mainMenu");
    }
  } else {
    if (document.activeElement !== userInputElement.value) {
      const int = parseInt(event.key);

      if (!isNaN(int)) {
        if (int === 1) {
          if (event.metaKey) {
            enableOnlyCharacter(NARRATOR);
          } else {
            switchEnabledCharacter(NARRATOR);
          }

          event.preventDefault();
        } else {
          const characterId = Object.keys(
            simulation.scenario.content.characters,
          ).at(int - 2);

          if (characterId) {
            if (event.metaKey) {
              enableOnlyCharacter(characterId);
            } else {
              switchEnabledCharacter(characterId);
            }

            event.preventDefault();
          } else {
            console.warn("Character not found at index", int);
          }
        }
      }
    }
  }
}

function onKeydown(event: KeyboardEvent) {
  if (inactive.value || isEditing.value) {
    return;
  }

  if (document.activeElement !== userInputElement.value) {
    if (event.key === "ArrowUp") {
      // Go back in history.
      if (simulation.canGoBack.value) simulation.goBack();
    } else if (event.key === "ArrowDown") {
      // Go forward in history.
      if (simulation.canGoForward.value) simulation.goForward();
      // Otherwise, predict the next update.
      else if (document.activeElement !== userInputElement.value) {
        if (userInput.value) sendMessage();
        else advance();
      }
    } else if (event.key === "ArrowLeft") {
      if (simulation.sandbox) {
        triggerPreviousVariantHandler?.();
      } else {
        console.warn("Swiping is disabled in non-sandbox mode");
      }
    } else if (event.key === "ArrowRight") {
      if (simulation.sandbox) {
        triggerNextVariantHandler?.();
      } else {
        console.warn("Swiping is disabled in non-sandbox mode");
      }
    }
  }
}

onMounted(() => {
  window.addEventListener("keypress", onKeypress);
  window.addEventListener("keydown", onKeydown);
});

onUnmounted(() => {
  console.log("Unmounted");
  window.removeEventListener("keypress", onKeypress);
  window.removeEventListener("keydown", onKeydown);
});
</script>

<template lang="pug">
.flex.h-full.w-full.flex-col.items-center.justify-between.gap-2.overflow-hidden
  .grid.w-full.gap-2(style="grid-template-columns: 1fr auto 1fr")
    .flex.items-start.justify-start.gap-2
      //- Main menu button.
      button._menu-button.group(
        @click="emit('mainMenu')"
        title="Main menu (Esc)"
      )
        MenuIcon.transition(:size="20" class="group-hover:animate-pulse")
        GpuStatus(:simulation :hide-when-ok="true")

    //- Enable or disable characters.
    PredictionOptionsPanel.max-w-xl(
      :simulation
      :enabled-character-ids="Array.from(enabledCharacterIds)"
      @switch-enabled-character="switchEnabledCharacter"
      @enable-only-character="enableOnlyCharacter"
    )

    .flex.items-start.justify-end
      //- Sandbox button.
      button._menu-button.group(
        v-if="simulation.mode === Mode.Immersive"
        @click="emit('devConsole')"
        title="Dev console (`)"
      )
        ShapesIcon.transition(:size="20" class="group-hover:animate-pulse")

  .flex.max-h-full.w-full.max-w-xl.flex-col.gap-2.overflow-hidden.rounded-lg.p-2(
    class="bg-black/10"
  )
    //- Top row.
    .flex.gap-2.overflow-hidden
      //- History of updates.
      UpdatesHistory.w-full(
        v-if="updatesFullscreen"
        :simulation
        :fullscreen="true"
        :hide-preference="true"
        :can-regenerate="simulation.sandbox"
        :can-edit="simulation.sandbox"
        :show-variant-navigation="simulation.sandbox"
        @trigger-edit-handler="triggerEditHandler = $event"
        @trigger-previous-variant-handler="triggerPreviousVariantHandler = $event"
        @trigger-next-variant-handler="triggerNextVariantHandler = $event"
        @choose-variant="chooseUpdateVariant"
        @regenerate="regenerateUpdate"
        @edit="onUpdateVariantEdit"
        @begin-edit="isEditing = true"
        @stop-edit="isEditing = false"
        :class="updatesFullscreen ? 'overflow-y-scroll' : 'overflow-y-hidden h-full'"
      )

      //- Single update.
      //- FIXME: `can-edit-user-update` shall be true only in specific cases.
      UpdateVue.h-full.contain-size(
        v-else-if="simulation.currentUpdate.value"
        :simulation
        :update="simulation.currentUpdate.value"
        :key="simulation.currentUpdate.value.parentId || 'root'"
        :can-regenerate="simulation.sandbox"
        :can-edit="simulation.sandbox"
        :is-single="true"
        :show-variant-navigation="simulation.sandbox"
        :hide-preference="true"
        :update-index="simulation.currentUpdateIndex.value"
        :may-change-tts-on-mount="true"
        @trigger-edit-handler="triggerEditHandler = $event"
        @trigger-previous-variant-handler="triggerPreviousVariantHandler = $event"
        @trigger-next-variant-handler="triggerNextVariantHandler = $event"
        @choose-variant="(variantIndex) => chooseUpdateVariant(simulation.currentUpdateIndex.value, variantIndex)"
        @regenerate="regenerateUpdate(simulation.currentUpdateIndex.value)"
        @edit="(variantIndex, newText) => onUpdateVariantEdit(simulation.currentUpdateIndex.value, variantIndex, newText)"
        @begin-edit="isEditing = true"
        @stop-edit="isEditing = false"
      )

      .flex.h-full.w-8.shrink-0.flex-col.justify-between.gap-2
        //- Expand updates button.
        button._button.relative.aspect-square.w-full(
          title="Expand (h)"
          @click="switchUpdatesFullscreen"
        )
          ChevronUpIcon.transition-transform(
            :size="20"
            :class="{ 'rotate-180': updatesFullscreen }"
          )

        .flex.flex-col.gap-2
          //- Visualization button.
          button._button.aspect-square.w-full(
            title="Neural screenshot (soon)"
            disabled
          )
            CameraIcon(:size="20")

          button._button.aspect-square.w-full(
            title="Go back (⬆️)"
            :disabled="!simulation.canGoBack.value"
            @click="simulation.goBack()"
          )
            UndoDotIcon(:size="20")

          button._button.aspect-square.w-full(
            title="Go forward (⬇)"
            :disabled="!simulation.canGoForward.value && !simulation.shallAdvanceEpisode.value"
            @click="simulation.canGoForward.value ? simulation.goForward() : advance()"
          )
            RedoDotIcon(:size="20")

    //- User input.
    .flex.h-12.w-full.gap-2.rounded
      .relative.w-full.rounded-lg.shadow-lg(
        :class="{ 'overflow-hidden': !!simulation.currentJob.value }"
      )
        //- Progress bar when simulation is busy.
        TransitionRoot.absolute.z-10.h-full.w-full(
          :show="!!simulation.currentJob.value"
          :unmount="true"
          enter="duration-100 ease-out"
          enter-from="translate-y-full opacity-0"
          enter-to="translate-y-0 opacity-100"
          leave="duration-100 ease-in"
          leave-from="translate-y-0 opacity-100"
          leave-to="translate-y-full opacity-0"
        )
          ProgressBar.h-full.w-full(:job="simulation.currentJob.value")

        //- User input otherwise.
        input.h-full.w-full.rounded-lg.px-3.transition-opacity(
          ref="userInputElement"
          v-model="userInput"
          :placeholder="userInputEnabled ? inputPlaceholder : ''"
          :disabled="!userInputEnabled"
          :class="{ '!opacity-50': !userInputEnabled }"
          @keydown.enter.exact="userInput ? sendMessage() : advance()"
        )

      button._button.group.relative.aspect-square.h-full(
        @click="onSendButtonClick"
        :disabled="busy || (!simulation.ready.value && !simulation.shallAdvanceEpisode.value)"
        :title="sendButtonState === SendButtonState.WillSendMessage ? 'Send message (enter)' : sendButtonState === SendButtonState.WillGoForward ? 'Go forward (enter)' : 'Predict (enter)'"
      )
        //- REFACTOR: Make a component for such multi-state animations.
        //- TODO: Abort button.
        TransitionRoot.absolute(
          :show="sendButtonState === SendButtonState.Busy"
          enter="duration-100 ease-out"
          enter-from="scale-0 opacity-0"
          enter-to="scale-100 opacity-100"
          leave="duration-100 ease-in"
          leave-from="scale-100 opacity-100"
          leave-to="scale-0 opacity-0"
        )
          Loader2Icon.animate-spin(:size="20")
        TransitionRoot.absolute(
          :show="busy && sendButtonState !== SendButtonState.Busy"
          enter="duration-100 ease-out"
          enter-from="scale-0 opacity-0"
          enter-to="scale-100 opacity-100"
          leave="duration-100 ease-in"
          leave-from="scale-100 opacity-100"
          leave-to="scale-0 opacity-0"
        )
          Loader2Icon.animate-spin(:size="20")
        TransitionRoot.absolute(
          :show="!busy && sendButtonState === SendButtonState.WillGoForward"
          enter="duration-100 ease-out"
          enter-from="scale-0 opacity-0"
          enter-to="scale-100 opacity-100"
          leave="duration-100 ease-in"
          leave-from="scale-100 opacity-100"
          leave-to="scale-0 opacity-0"
        )
          RedoDotIcon(:size="20")
        TransitionRoot.absolute(
          :show="!busy && sendButtonState === SendButtonState.WillSendMessage"
          enter="duration-100 ease-out"
          enter-from="scale-0 opacity-0"
          enter-to="scale-100 opacity-100"
          leave="duration-100 ease-in"
          leave-from="scale-100 opacity-100"
          leave-to="scale-0 opacity-0"
        )
          SendHorizontalIcon(
            :size="20"
            class="group-hover:animate-pulse group-hover:text-ai-500"
          )
        TransitionRoot.absolute(
          :show="!busy && sendButtonState === SendButtonState.WillPredict"
          enter="duration-100 ease-out"
          enter-from="scale-0 opacity-0"
          enter-to="scale-100 opacity-100"
          leave="duration-100 ease-in"
          leave-from="scale-100 opacity-100"
          leave-to="scale-0 opacity-0"
        )
          SparklesIcon(
            :size="20"
            class="group-hover:animate-pulse group-hover:text-ai-500"
          )
</template>

<style lang="postcss" scoped>
._button {
  @apply btn-shadow grid place-items-center rounded-lg bg-white shadow transition pressable;
  @apply disabled:cursor-not-allowed disabled:opacity-50;
}

._menu-button {
  @apply btn-shadow rounded bg-black/10 p-1.5 text-white transition pressable;
}
</style>

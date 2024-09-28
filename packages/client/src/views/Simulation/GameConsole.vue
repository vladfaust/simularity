<script setup lang="ts">
import { type CompletionOptions } from "@/lib/ai/llm/BaseLlmDriver";
import * as api from "@/lib/api";
import { Mode, Simulation } from "@/lib/simulation";
import {
  NARRATOR,
  type PredictionOptions,
} from "@/lib/simulation/agents/writer";
import { accountBalanceQueryKey } from "@/queries";
import { TransitionRoot } from "@headlessui/vue";
import { useQueryClient } from "@tanstack/vue-query";
import { StorageSerializers, useLocalStorage } from "@vueuse/core";
import {
  // CameraIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Loader2Icon,
  MenuIcon,
  RedoDotIcon,
  SendHorizontalIcon,
  SparklesIcon,
  SquareSigmaIcon,
  UndoDotIcon,
} from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref, triggerRef } from "vue";
import { toast } from "vue3-toastify";
import PredictionOptionsPanel from "./GameConsole/PredictionOptionsPanel.vue";
import ProgressBar from "./GameConsole/ProgressBar.vue";
import VisualizeModal from "./GameConsole/VisualizeModal.vue";
import UpdateVue from "./Update.vue";
import UpdatesHistory from "./UpdatesHistory.vue";
import GpuStatus from "./GpuStatus.vue";
import { watch } from "vue";

enum SendButtonState {
  Busy,
  WillSendMessage,
  WillGoForward,
  WillPredict,
}

const N_EVAL = 100;

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
  if (inferenceAbortController.value) {
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

const showVisualizeModal = ref(false);

const contextGaugeCssVar = computed(() => {
  const contextLength = simulation.contextLength.value;
  const contextSize = simulation.writer.contextSize.value;
  if (!contextLength || !contextSize) return 0;
  return (contextLength / contextSize) * 100 + "%";
});

const inputPlaceholder = computed(
  () => `Speak as ${simulation.scenario.defaultCharacter.name}`,
);

const queryClient = useQueryClient();
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

    await simulation.predictUpdate(
      N_EVAL,
      predictionOptions.value,
      modelSettings.value,
      inferenceAbortController.value!.signal,
    );
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
    queryClient.invalidateQueries({ queryKey: accountBalanceQueryKey() });
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
    } else {
      if (simulation.canGoForward.value) {
        await simulation.goForward();
      } else {
        inferenceAbortController.value = new AbortController();

        await simulation.predictUpdate(
          N_EVAL,
          predictionOptions.value,
          modelSettings.value,
          inferenceAbortController.value!.signal,
        );
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
    queryClient.invalidateQueries({ queryKey: accountBalanceQueryKey() });
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
    simulation.voicer.stopTts();

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
      N_EVAL,
      predictionOptions.value,
      modelSettings.value,
      inferenceAbortController.value!.signal,
    );
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
    queryClient.invalidateQueries({ queryKey: accountBalanceQueryKey() });
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
      event.preventDefault();
      triggerEditHandler?.();
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
      console.log("ArrowLeft");
      triggerPreviousVariantHandler?.();
    } else if (event.key === "ArrowRight") {
      console.log("ArrowRight");
      triggerNextVariantHandler?.();
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
.flex.h-full.w-full.flex-col.items-center.justify-between.gap-2.overflow-hidden(
  :class="{ grayscale: inactive }"
)
  //- Enable or disable characters.
  PredictionOptionsPanel.max-w-xl(
    :simulation
    :enabled-character-ids="Array.from(enabledCharacterIds)"
    @switch-enabled-character="switchEnabledCharacter"
    @enable-only-character="enableOnlyCharacter"
  )

  .flex.max-h-full.w-full.max-w-xl.flex-col.gap-2.overflow-hidden.rounded-lg.p-2.shadow-lg(
    class="bg-black/10"
  )
    //- Top row.
    .flex.gap-2.overflow-hidden(:class="updatesFullscreen ? 'h-full' : 'h-36'")
      //- History of updates.
      UpdatesHistory.w-full(
        v-if="updatesFullscreen"
        :simulation
        :fullscreen="true"
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
      UpdateVue.h-full(
        v-else-if="simulation.currentUpdate.value"
        :simulation
        :update="simulation.currentUpdate.value"
        :key="simulation.currentUpdate.value.parentId || 'root'"
        :can-regenerate="true"
        :can-edit="true"
        :is-single="true"
        :show-variant-navigation="true"
        :update-index="simulation.currentUpdateIndex.value"
        @trigger-edit-handler="triggerEditHandler = $event"
        @trigger-previous-variant-handler="triggerPreviousVariantHandler = $event"
        @trigger-next-variant-handler="triggerNextVariantHandler = $event"
        @choose-variant="(variantIndex) => chooseUpdateVariant(simulation.currentUpdateIndex.value, variantIndex)"
        @regenerate="regenerateUpdate(simulation.currentUpdateIndex.value)"
        @edit="(variantIndex, newText) => onUpdateVariantEdit(simulation.currentUpdateIndex.value, variantIndex, newText)"
        @begin-edit="isEditing = true"
        @stop-edit="isEditing = false"
      )

      .flex.h-full.w-8.shrink-0.flex-col.justify-between.gap-1
        //- Expand updates button.
        button._button.relative.aspect-square.w-full(
          title="Expand (h)"
          @click="switchUpdatesFullscreen"
        )
          TransitionRoot.absolute(
            :show="updatesFullscreen"
            enter="duration-100 ease-out"
            enter-from="scale-0 opacity-0"
            enter-to="scale-100 opacity-100"
            leave="duration-100 ease-in"
            leave-from="scale-100 opacity-100"
            leave-to="scale-0 opacity-0"
          )
            ChevronDownIcon(:size="20")
          TransitionRoot.absolute(
            :show="!updatesFullscreen"
            enter="duration-100 ease-out"
            enter-from="scale-0 opacity-0"
            enter-to="scale-100 opacity-100"
            leave="duration-100 ease-in"
            leave-from="scale-100 opacity-100"
            leave-to="scale-0 opacity-0"
          )
            ChevronUpIcon(:size="20")

        .flex.flex-col.gap-1
          //- //- Visualization button.
          //- button._button.aspect-square.w-full(
          //-   title="Go back"
          //-   @click="showVisualizeModal = true"
          //- )
          //-   CameraIcon(:size="20")

          button._button.aspect-square.w-full(
            title="Go back (⬆️)"
            :disabled="!simulation.canGoBack.value"
            @click="simulation.goBack()"
          )
            UndoDotIcon(:size="20")

          button._button.aspect-square.w-full(
            title="Go forward (⬇)"
            :disabled="!simulation.canGoForward.value"
            @click="simulation.goForward()"
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
        input.h-full.w-full.rounded-lg.px-3.opacity-90.transition-opacity(
          ref="userInputElement"
          v-model="userInput"
          :placeholder="userInputEnabled ? inputPlaceholder : ''"
          :disabled="!userInputEnabled"
          class="!disabled:opacity-50 hover:opacity-100 focus:opacity-100"
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

    //- Status.
    .flex.w-full.justify-between
      .flex.w-full.items-center.gap-2
        //- Quit to main menu button.
        button.btn-shadow.group.flex.items-center.gap-1.rounded.bg-white.p-1.pr-2.shadow.transition.pressable(
          @click="emit('mainMenu')"
          title="Quit to main menu"
        )
          MenuIcon.transition(:size="20" class="group-hover:animate-pulse")
          GpuStatus(:simulation)

        //- Context gauge.
        .flex.w-full.items-center.gap-2
          .relative.flex.w-full.items-center.justify-center.shadow-lg(
            :class="{ 'animate-pulse': simulation.consolidationInProgress.value }"
          )
            progress._ctx-progress.h-6.w-full(
              :value="simulation.contextLength.value"
              :max="simulation.writer.contextSize.value"
              title="Context length"
            )
            span._ctx-progress-text.pointer-events-none.absolute.w-full.select-none.text-center.text-xs.font-medium(
              :style="`--value: ${contextGaugeCssVar}`"
            )
              | {{ simulation.contextLength.value ?? "?" }}/{{ simulation.writer.contextSize.value }}

          //- Summarize button.
          button._status-button.group(
            @click="simulation.consolidate()"
            class="disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!simulation.canConsolidate.value"
            :title="simulation.consolidationPreliminaryError.value?.message ?? 'Consolidate'"
          )
            Loader2Icon.animate-spin(
              v-if="simulation.consolidationInProgress.value"
              :size="20"
            )
            SquareSigmaIcon(
              v-else
              :size="20"
              class="group-hover:animate-pulse group-hover:text-ai-500"
            )

  VisualizeModal(
    v-if="simulation"
    :open="showVisualizeModal"
    :simulation
    @close="showVisualizeModal = false"
  )
</template>

<style lang="scss" scoped>
._button {
  @apply btn-shadow grid place-items-center rounded-lg bg-white shadow transition pressable;
  @apply disabled:cursor-not-allowed disabled:opacity-50;
}

._status-button {
  @apply btn-shadow aspect-square rounded bg-white p-1 shadow transition pressable;
}

._ctx-progress {
  @apply opacity-90 transition-opacity hover:opacity-100 focus:opacity-100;

  &::-webkit-progress-value {
    @apply bg-gradient-to-t from-ai-600 to-ai-500;
  }

  &::-webkit-progress-bar {
    @apply overflow-hidden rounded bg-white;
  }
}

._ctx-progress-text {
  background: linear-gradient(to right, white var(--value, 50%), black 0);
  background-clip: text;
  color: transparent;
}
</style>

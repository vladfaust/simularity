<script setup lang="ts">
import { type InferenceOptions } from "@/lib/simularity/common";
import { Simulation } from "@/lib/simulation";
import { TransitionRoot } from "@headlessui/vue";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  Loader2Icon,
  MenuIcon,
  RedoDotIcon,
  SendHorizontalIcon,
  SkipForwardIcon,
  SquareIcon,
  UndoDotIcon,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import UpdateVue from "./Update.vue";
import UpdatesHistory from "./UpdatesHistory.vue";
import {
  NARRATOR,
  type PredictionOptions,
} from "@/lib/simulation/agents/writer";
import AiStatus from "./AiStatus.vue";
import AiSettingsModal from "./AiSettingsModal.vue";
import { useLocalStorage } from "@vueuse/core";

enum SendButtonState {
  Inferring,
  WillSendMessage,
  WillSkipTurn,
}

const N_EVAL = 128;

const { simulation, fadeCanvas, screenshot } = defineProps<{
  simulation: Simulation;
  fadeCanvas: (callback: () => Promise<void>) => Promise<void>;
  screenshot: (rewrite: boolean) => Promise<any>;
}>();

const emit = defineEmits<{
  (event: "mainMenu"): void;
}>();

const modelSettings = ref<InferenceOptions>({
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
  temp: 1.1,
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
 * Inference decoding progress, from 0 to 1, if inferring.
 */
const inferenceDecodingProgress = ref<number | undefined>();

/**
 * Whether the updates are displayed in fullscreen.
 */
const updatesFullscreen = ref(false);

const predictionOptions = computed<PredictionOptions>(() => ({
  allowedCharacterIds: enabledCharacterIds.value,
}));

const willConsolidate = ref(false);

const sendButtonState = computed<SendButtonState>(() => {
  if (inferenceAbortController.value) {
    return SendButtonState.Inferring;
  } else {
    if (userInput.value) return SendButtonState.WillSendMessage;
    return SendButtonState.WillSkipTurn;
  }
});

const showAiSettingsModal = ref(false);
const enabledCharacterIds = useLocalStorage(
  `simulation:${simulation.id}:enabledCharacterIds`,
  [...Object.keys(simulation.scenario.characters), NARRATOR],
);

function progressCallback(eventName: string) {
  return (event: { progress: number }) => {
    const progress = Math.round(event.progress * 100);
    console.log(`${eventName}: ${progress}%`);
  };
}

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
  inferenceDecodingProgress.value = 0;

  try {
    if (willConsolidate.value) {
      await simulation.consolidate(inferenceAbortController.value!.signal);
      if (inferenceAbortController.value!.signal.aborted) return;
      willConsolidate.value = false;
    }

    await simulation.createUpdate(
      simulation.scenario.defaultCharacterId,
      userMessage,
    );

    await simulation.predictUpdate(
      N_EVAL,
      predictionOptions.value,
      modelSettings.value,
      (e) => (inferenceDecodingProgress.value = e.progress),
      inferenceAbortController.value!.signal,
    );
  } catch (e) {
    if (wouldRestoreUserInput) {
      userInput.value = userMessage;
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
  if (userInput.value) {
    throw new Error("To advance, user input must be empty");
  }

  busy.value = true;
  try {
    if (simulation.state.shallAdvanceEpisode.value) {
      await simulation.advanceCurrentEpisode(progressCallback("Decoding"));
    } else {
      if (!willConsolidate.value && simulation.canGoForward.value) {
        await simulation.goForward();
        await simulation.createCurrentUpdateVariant(
          N_EVAL,
          predictionOptions.value,
          modelSettings.value,
          (e) => (inferenceDecodingProgress.value = e.progress),
          inferenceAbortController.value?.signal,
        );
      } else {
        inferenceAbortController.value = new AbortController();

        if (willConsolidate.value) {
          await simulation.consolidate(inferenceAbortController.value!.signal);
          if (inferenceAbortController.value!.signal.aborted) return;
          willConsolidate.value = false;
        }

        await simulation.predictUpdate(
          N_EVAL,
          predictionOptions.value,
          modelSettings.value,
          (e) => (inferenceDecodingProgress.value = e.progress),
          inferenceAbortController.value!.signal,
        );
      }
    }
  } catch (e: any) {
    console.error(e);
    throw e;
  } finally {
    inferenceDecodingProgress.value = undefined;
    inferenceAbortController.value = null;
    busy.value = false;
  }

  screenshot(true);
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
  inferenceDecodingProgress.value = 0;

  try {
    if (updateIndex !== simulation.currentUpdateIndex.value) {
      await fadeCanvas(async () => {
        await simulation.jumpToIndex(updateIndex);
      });
    }

    await simulation.createCurrentUpdateVariant(
      N_EVAL,
      predictionOptions.value,
      modelSettings.value,
      (e) => (inferenceDecodingProgress.value = e.progress),
      inferenceAbortController.value!.signal,
    );
  } finally {
    inferenceDecodingProgress.value = undefined;
    inferenceAbortController.value = null;
    busy.value = false;
  }
}

function switchUpdatesFullscreen() {
  updatesFullscreen.value = !updatesFullscreen.value;
}

function switchEnabledCharacter(characterId: string) {
  const index = enabledCharacterIds.value.indexOf(characterId);

  if (index === -1) {
    enabledCharacterIds.value.push(characterId);
  } else {
    enabledCharacterIds.value.splice(index, 1);
  }
}

function enableOnlyCharacter(characterId: string) {
  // If the character is already the only one enabled, select all except them.
  if (
    enabledCharacterIds.value.length === 1 &&
    enabledCharacterIds.value[0] === characterId
  ) {
    enabledCharacterIds.value = [
      ...Object.keys(simulation.scenario.characters).filter(
        (id) => id !== characterId,
      ),
      NARRATOR,
    ];
  } else {
    // Otherwise, enable only the selected character.
    enabledCharacterIds.value = [characterId];
  }
}
</script>

<template lang="pug">
.flex.max-h-full.w-full.max-w-xl.flex-col.overflow-hidden.rounded-lg.shadow-lg(
  class="bg-black/10"
)
  .flex.h-full.flex-col.gap-2.overflow-hidden.p-2
    //- Top row.
    .flex.gap-2.overflow-hidden(:class="updatesFullscreen ? 'h-full' : 'h-36'")
      //- History of updates.
      UpdatesHistory.w-full(
        v-if="updatesFullscreen"
        :simulation
        :fullscreen="true"
        @choose-variant="chooseUpdateVariant"
        @regenerate="regenerateUpdate"
        @edit="onUpdateVariantEdit"
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
        @choose-variant="(variantIndex) => chooseUpdateVariant(simulation.currentUpdateIndex.value, variantIndex)"
        @regenerate="regenerateUpdate(simulation.currentUpdateIndex.value)"
        @edit="(variantIndex, newText) => onUpdateVariantEdit(simulation.currentUpdateIndex.value, variantIndex, newText)"
      )

      .flex.h-full.w-8.shrink-0.flex-col.justify-between.gap-1
        //- Expand updates button.
        button._button.relative.aspect-square.w-full(
          title="Expand"
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
          button._button.aspect-square.w-full(
            title="Go back"
            :disabled="!simulation.canGoBack.value"
            @click="simulation.goBack()"
          )
            UndoDotIcon(:size="20")

          button._button.aspect-square.w-full(
            title="Go forward"
            :disabled="!simulation.canGoForward.value"
            @click="simulation.goForward()"
          )
            RedoDotIcon(:size="20")

    //- User input.
    .flex.h-12.w-full.gap-2.rounded
      input.h-full.w-full.rounded-lg.px-3.shadow-lg(
        v-model="userInput"
        placeholder="User input"
        :disabled="!userInputEnabled"
        class="disabled:opacity-50"
        @keydown.enter.exact="userInput ? sendMessage() : advance()"
      )

      button._button.relative.aspect-square.h-full(
        @click="onSendButtonClick"
        :disabled="busy && !inferenceAbortController"
      )
        //- REFACTOR: Make a component for such multi-state animations.
        TransitionRoot.absolute(
          :show="sendButtonState === SendButtonState.Inferring"
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
          :show="busy && sendButtonState !== SendButtonState.Inferring"
          enter="duration-100 ease-out"
          enter-from="scale-0 opacity-0"
          enter-to="scale-100 opacity-100"
          leave="duration-100 ease-in"
          leave-from="scale-100 opacity-100"
          leave-to="scale-0 opacity-0"
        )
          Loader2Icon.animate-spin(:size="20")
        TransitionRoot.absolute(
          :show="!busy && sendButtonState === SendButtonState.WillSendMessage"
          enter="duration-100 ease-out"
          enter-from="scale-0 opacity-0"
          enter-to="scale-100 opacity-100"
          leave="duration-100 ease-in"
          leave-from="scale-100 opacity-100"
          leave-to="scale-0 opacity-0"
        )
          SendHorizontalIcon(:size="20")
        TransitionRoot.absolute(
          :show="!busy && sendButtonState === SendButtonState.WillSkipTurn"
          enter="duration-100 ease-out"
          enter-from="scale-0 opacity-0"
          enter-to="scale-100 opacity-100"
          leave="duration-100 ease-in"
          leave-from="scale-100 opacity-100"
          leave-to="scale-0 opacity-0"
        )
          SkipForwardIcon(:size="20")

  //- Status.
  .flex.w-full.justify-between.p-2(class="bg-black/20")
    .flex.items-center.gap-2
      AiStatus.cursor-pointer.rounded.bg-white.bg-opacity-50.px-2.py-1.transition-transform.pressable(
        :simulation
        @click="showAiSettingsModal = true"
      )

      //- Temporary context gauge.
      .flex.items-center.gap-1.text-sm
        span.text-white {{ simulation.writer.value?.contextLength.value }} / {{ simulation.writer.value?.contextSize.value }}
        button.rounded.px-2.py-1.transition-transform.pressable(
          @click="willConsolidate = !willConsolidate"
          :class="willConsolidate ? 'bg-green-500' : 'bg-gray-500'"
          class="disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!simulation.canConsolidate.value"
          :title="simulation.consolidationPreliminaryError.value?.message ?? 'Consolidate'"
        )
          span.text-white {{ willConsolidate ? "Will consolidate" : "Do not consolidate" }}

    .flex.gap-2
      button._status-button(@click="emit('mainMenu')")
        MenuIcon(:size="20")

  AiSettingsModal(
    v-if="simulation"
    :open="showAiSettingsModal"
    :simulation
    :enabled-character-ids
    @switch-enabled-character="switchEnabledCharacter"
    @enable-only-character="enableOnlyCharacter"
    @close="showAiSettingsModal = false"
  )
</template>

<style lang="scss" scoped>
._button {
  @apply grid place-items-center rounded-lg bg-white shadow transition pressable;
  @apply disabled:opacity-50;
}

._status-button {
  @apply rounded bg-white px-2 py-1 shadow transition-transform pressable;
}
</style>

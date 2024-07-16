<script setup lang="ts">
import { type InferenceOptions } from "@/lib/simularity/common";
import { Simulation } from "@/lib/simulation";
import { AssistantUpdate, UserUpdate } from "@/lib/simulation/updates";
import { TransitionRoot } from "@headlessui/vue";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ListEndIcon,
  Loader2Icon,
  RedoDotIcon,
  SendHorizontalIcon,
  SkipForwardIcon,
  SquareIcon,
  UndoDotIcon,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import GptStatus from "./GptStatus.vue";
import SingleUpdate from "./SingleUpdate.vue";
import UpdatesHistory from "./UpdatesHistory.vue";

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

const modelSettings = ref<InferenceOptions>({
  minP: 0.1,
  mirostat: {
    version: "v1",
    tau: 5,
    eta: 0.1,
  },
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

const sendButtonState = computed<SendButtonState>(() => {
  if (inferenceAbortController.value) {
    return SendButtonState.Inferring;
  } else {
    if (userInput.value) return SendButtonState.WillSendMessage;
    return SendButtonState.WillSkipTurn;
  }
});

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
    if (userInput.value) sendUserMessage();
    else advance();
  } else {
    console.warn("Busy, cannot send message");
  }
}

/**
 * Send user message to the chat.
 */
async function sendUserMessage() {
  let userMessage = userInput.value;
  if (!userMessage) throw new Error("Empty user input");

  userInput.value = "";
  let wouldRestoreUserInput = true;

  busy.value = true;
  inferenceAbortController.value = new AbortController();
  inferenceDecodingProgress.value = 0;

  try {
    await simulation.createUserUpdate(
      userMessage,
      N_EVAL,
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
      inferenceAbortController.value = new AbortController();

      await simulation.createAssistantUpdate(
        N_EVAL,
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

  screenshot(true);
}

/**
 * Choose a variant of an assistant update.
 */
function chooseAssistantVariant(update: AssistantUpdate, variantIndex: number) {
  simulation.chooseAssistantUpdateVariant(update, variantIndex, fadeCanvas);
}

/**
 * Edit a user update.
 */
async function onUserUpdateEdit(update: UserUpdate, newText: string) {
  if (busy.value) throw new Error("Already busy");
  busy.value = true;

  try {
    await simulation.editUserUpdateText(update, newText);
  } finally {
    busy.value = false;
  }
}

/**
 * Edit an assistant update.
 */
async function onAssistantUpdateEdit(update: AssistantUpdate, newText: string) {
  if (busy.value) throw new Error("Already busy");
  busy.value = true;

  try {
    await simulation.editAssistantUpdateVariantText(update, newText);
  } finally {
    busy.value = false;
  }
}

/**
 * Explicitly regenerate an assistant update.
 */
async function regenerateAssistantUpdate(regeneratedUpdate: AssistantUpdate) {
  if (busy.value) throw new Error("Already busy");
  busy.value = true;

  inferenceAbortController.value = new AbortController();
  inferenceDecodingProgress.value = 0;

  try {
    await simulation.createAssistantUpdateVariant(
      regeneratedUpdate,
      fadeCanvas,
      N_EVAL,
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
</script>

<template lang="pug">
.flex.max-h-full.w-full.max-w-xl.grow.flex-col.justify-end.gap-2.overflow-hidden.px-2
  //- Top row.
  .flex.max-h-full.gap-2.overflow-hidden(
    :class="updatesFullscreen ? 'h-full' : 'h-36'"
  )
    //- History of updates.
    UpdatesHistory.w-full(
      v-if="updatesFullscreen"
      :simulation
      :fullscreen="true"
      @choose-assistant-variant="chooseAssistantVariant"
      @regenerate-assistant-update="regenerateAssistantUpdate"
      @on-user-update-edit="onUserUpdateEdit"
      @on-assistant-update-edit="onAssistantUpdateEdit"
      :class="updatesFullscreen ? 'overflow-y-scroll' : 'overflow-y-hidden h-full'"
    )

    //- Single update.
    //- FIXME: `can-edit-user-update` shall be true only in specific cases.
    SingleUpdate.h-full.w-full(
      v-else-if="simulation.currentUpdate.value"
      :update="simulation.currentUpdate.value"
      :key="simulation.currentUpdate.value.parentId || 'root'"
      :can-regenerate-assistant-update="!simulation.canGoForward.value"
      :can-edit-assistant-update="!simulation.canGoForward.value"
      :can-edit-user-update="true"
      :show-variant-navigation="!simulation.canGoForward.value"
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

        button._button.aspect-square.w-full(
          title="Skip to the end"
          :disabled="!simulation.canGoForward.value"
          @click="simulation.skipToEnd()"
        )
          ListEndIcon(:size="20")

  //- User input.
  .flex.h-12.w-full.gap-2.rounded
    input.h-full.w-full.rounded-lg.px-3.shadow-lg(
      v-model="userInput"
      placeholder="User input"
      :disabled="!userInputEnabled"
      class="disabled:opacity-50"
      @keydown.enter.exact="userInput ? sendUserMessage() : advance()"
    )

    button._button.relative.aspect-square.h-full(
      @click="onSendButtonClick"
      :disabled="(busy && !inferenceAbortController) || simulation.canGoForward.value"
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
  .flex.w-full.justify-center.bg-white.bg-opacity-25.p-2
    .flex.items-center.gap-1
      GptStatus(:gpt="simulation.writer.value" name="Writer")
</template>

<style lang="scss" scoped>
._button {
  @apply grid place-items-center rounded-lg bg-white transition pressable;
  @apply disabled:opacity-50;
}
</style>

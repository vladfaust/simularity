<script setup lang="ts">
import CharacterPfp from "@/components/CharacterPfp.vue";
import { Simulation } from "@/lib/simulation";
import { type UpdateVariant } from "@/lib/simulation/update";
// import { minutesToClock, tap } from "@/lib/utils";
import * as api from "@/lib/api";
import { confirm_ } from "@/lib/resources";
import { Writer } from "@/lib/simulation/agents/writer";
import {
  AudioLinesIcon,
  BotIcon,
  CheckIcon,
  Edit3Icon,
  Loader2Icon,
  SigmaSquareIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  TriangleAlertIcon,
  Volume2Icon,
  XIcon,
} from "lucide-vue-next";
import { computed, onMounted, ref, watch } from "vue";
import { toast } from "vue3-toastify";
import RichText from "./RichText.vue";

const props = defineProps<{
  simulation: Simulation;
  variant: UpdateVariant;
  isSingle: boolean;
  canEdit: boolean;
  hideTts?: boolean;
  hidePreference?: boolean;
  preferenceFunction: (preference: boolean | null) => Promise<void>;
  applyEditFunction: (newContent: string) => Promise<void>;
  mayChangeTtsOnMount?: boolean;
}>();

const emit = defineEmits<{
  (event: "triggerEditHandler", handler: () => void): void;
  (event: "beginEdit"): void;
  (event: "stopEdit"): void;
}>();

const editInProgress = ref(false);
const applyingEditInProgress = ref(false);
const applyingPreferenceInProgress = ref(false);
const editText = ref(props.variant.writerUpdate.text);
const ttsPlaying = computed(
  () =>
    props.simulation.voicer.playingTts.value === props.variant.ttsPath.value,
);
const ttsCreationInProgress = ref(false);
let ttsJob: { promise: Promise<string>; cancel: () => void } | null = null;

const anyEditChanges = computed(() => {
  return editText.value.trim() !== props.variant.writerUpdate.text.trim();
});

const characterId = computed(() => {
  return props.variant.writerUpdate.characterId;
});

const character = computed(() => {
  if (characterId.value) {
    return props.simulation.scenario.ensureCharacter(characterId.value);
  } else {
    return null;
  }
});

// const clock = computed(() => {
//   const minutes = props.variant.writerUpdate.simulationDayClock;
//   return tap(minutes, minutesToClock);
// });

const editTextarea = ref<HTMLTextAreaElement | null>(null);

const consolidationThreshold = computed(() => {
  if (!props.simulation.writer.contextSize.value) return undefined;
  return props.simulation.writer.contextSize.value - Writer.TASK_BUFFER_SIZE;
});

const consolidationWarning = computed(() => {
  if (!props.variant.completionLength || !consolidationThreshold.value) {
    return undefined;
  }

  return props.variant.completionLength >= consolidationThreshold.value;
});

async function onEditCommitClick() {
  if (!anyEditChanges.value) {
    console.log("No changes");
    editInProgress.value = false;
    return;
  }

  applyingEditInProgress.value = true;
  try {
    await props.applyEditFunction(editText.value.trim());
    editInProgress.value = false;
  } finally {
    applyingEditInProgress.value = false;
  }
}

async function prefer(preference: boolean) {
  applyingPreferenceInProgress.value = true;

  try {
    if (props.variant.writerUpdate.preference === preference) {
      console.debug(
        `Preference already set to ${preference}, resetting to null`,
      );
      await props.preferenceFunction(null);
    } else {
      console.debug("Setting preference to", preference);
      await props.preferenceFunction(preference);
    }
  } finally {
    applyingPreferenceInProgress.value = false;
  }
}

function switchPlayTts() {
  if (!props.variant.ttsPath.value) {
    throw new Error("No TTS path");
  }

  if (ttsPlaying.value) {
    props.simulation.voicer.stopTts(props.variant.ttsPath.value);
  } else {
    props.simulation.voicer.playTtsFromFile(props.variant.ttsPath.value);
  }
}

async function createTts() {
  ttsJob = await props.simulation.inferTts(props.variant);
  if (!ttsJob) return;

  ttsCreationInProgress.value = true;
  ttsJob.promise
    .then(() => {
      switchPlayTts();
    })
    .catch((e) => {
      if (e instanceof api.UnauthorizedError) {
        console.warn(e);
        toast.error("Please log in.");
      } else if (e instanceof api.PaymentRequiredError) {
        console.warn(e);
        toast.error("Not enough credits.");
      } else {
        toast.error("Failed to create TTS");
        throw e;
      }
    })
    .finally(() => {
      ttsCreationInProgress.value = false;
    });
}

function startEdit() {
  if (props.variant.writerUpdate.episodeId) {
    console.debug("Cannot edit episode variant");
    return;
  }

  editInProgress.value = true;

  setTimeout(() => {
    editTextarea.value?.focus();
  }, 10);
}

async function onConsolidateClick() {
  if (props.variant.writerUpdate.didConsolidate) {
    console.log("Already summarized");
    return;
  }

  if (
    !(await confirm_(
      "Do you want to tell the writer agent to summarize? It would take some time. Otherwise, the summarization is automatic.",
      {
        title: "Summarize",
        okLabel: "Summarize",
        type: "info",
      },
    ))
  ) {
    console.log("Summarization cancelled");
    return;
  }

  try {
    await props.simulation.consolidate(true);
  } catch (e: any) {
    console.error("Error summarizing", e);
    toast.error("Failed to summarize");
    throw e;
  }
}

watch(
  () => editInProgress.value,
  (editInProgress) => {
    if (editInProgress) {
      editText.value = props.variant.writerUpdate.text;
      emit("beginEdit");
    } else {
      emit("stopEdit");
    }
  },
);

onMounted(() => {
  emit("triggerEditHandler", startEdit);

  if (
    props.mayChangeTtsOnMount &&
    props.simulation.voicer.playingTts.value &&
    props.variant.ttsPath.value &&
    props.simulation.voicer.playingTts.value !== props.variant.ttsPath.value
  ) {
    // Switch to current TTS if voicer is playing anything.
    console.debug("Switching to current TTS");
    props.simulation.voicer.playTtsFromFile(props.variant.ttsPath.value);
  }
});
</script>

<template lang="pug">
.flex.flex-col
  //- Top row.
  .flex.items-center.justify-between.gap-3
    //- Character.
    .flex.items-center.gap-1
      template(v-if="character")
        CharacterPfp.aspect-square.h-5.rounded.border(
          :scenario="props.simulation.scenario"
          :character
        )
        span.font-semibold.leading-none(:style="{ color: character.color }") {{ character.name }}
      template(v-else-if="character === null")
        .grid.aspect-square.h-5.place-items-center.rounded.border
          BotIcon(:size="16")
        span.font-semibold.leading-none Narrator
      //- span.leading-none {{ clock }}

      //- //- ADHOC: Consolidation indicator.
      //- span.leading-none(v-if="variant.writerUpdate.didConsolidate") [C]

    //- Buttons.
    .flex.items-center.gap-2
      slot(name="extra")

      //- TTS.
      template(
        v-if="!hideTts && !editInProgress && !variant.writerUpdate.episodeId"
      )
        //- Play TTS.
        //- Press again to stop.
        button.btn-pressable(
          v-if="variant.ttsPath.value"
          @click.stop="switchPlayTts"
        )
          Volume2Icon(:size="20" :class="{ 'text-primary-500': ttsPlaying }")

        //- Create TTS.
        button.btn.btn-pressable.transition(
          v-else
          @click.stop="createTts"
          :disabled="ttsCreationInProgress || !simulation.voicer.enabled.value"
          :class="{ 'hover:text-ai-500 hover:animate-pulse': !ttsCreationInProgress }"
          :title="simulation.voicer.enabled.value ? 'Create TTS' : 'Voicer is disabled'"
        )
          Loader2Icon.animate-spin(:size="20" v-if="ttsCreationInProgress")
          AudioLinesIcon(:size="20" v-else)

      //- Preference.
      .flex.items-center.gap-1(
        v-if="!hidePreference && !editInProgress && !variant.writerUpdate.episodeId"
      )
        button.btn-pressable(
          :class="{ 'text-success-500': variant.writerUpdate.preference === true }"
          @click="prefer(true)"
          :disabled="applyingPreferenceInProgress"
        )
          ThumbsUpIcon(:size="18" style="margin-top: -0.3rem")

        button.btn-pressable(
          :class="{ 'text-error-500': variant.writerUpdate.preference === false }"
          @click="prefer(false)"
          :disabled="applyingPreferenceInProgress"
        )
          ThumbsDownIcon(:size="18" style="margin-top: 0.3rem")

      //- Edit.
      .flex(v-if="canEdit && !variant.writerUpdate.episodeId")
        button(v-if="!editInProgress" @click.stop="startEdit" title="Edit (e)")
          Edit3Icon(:size="20")

        template(v-else)
          button.btn-pressable(
            @click.stop="onEditCommitClick"
            :disabled="applyingEditInProgress"
          )
            Loader2Icon.animate-spin(:size="20" v-if="applyingEditInProgress")
            CheckIcon(v-else :size="20")

          button(
            @click.stop="editInProgress = false"
            :disabled="applyingEditInProgress"
          )
            XIcon(:size="20")

      //- Variant navigation.
      slot(v-if="!editInProgress" name="variant-navigation")

  //- Text.
  .flex.flex-col.justify-between.gap-1(
    :class="{ 'h-full overflow-y-scroll': isSingle }"
    class="mt-0.5"
  )
    textarea.mt-1.h-full.w-full.rounded-lg.bg-neutral-100.px-2.py-1.font-mono.text-sm.leading-snug(
      v-if="editInProgress"
      ref="editTextarea"
      v-model="editText"
      @keydown.enter.prevent="onEditCommitClick"
      @keydown.escape="editInProgress = false"
    )

    RichText.leading-snug(v-else :text="variant.writerUpdate.text" as="p")

    .flex.w-full.items-center.justify-end(class="mt-0.5")
      button.btn.relative.opacity-50(
        v-if="variant.writerUpdate.completion"
        v-tooltip="`Context length: ${variant.completionLength || '?'}/${simulation.writer.contextSize.value ?? '?'} (${variant.writerUpdate.didConsolidate ? 'already summarized' : 'click to summarize'})`"
        class="gap-0.5 hover:opacity-100"
        @click="onConsolidateClick"
        :class="{ 'cursor-pointer btn-pressable': !variant.writerUpdate.didConsolidate, 'cursor-help': variant.writerUpdate.didConsolidate }"
      )
        span.text-xs.font-medium(v-if="variant.completionLength") {{ simulation.writer.contextSize.value ? Math.round((variant.completionLength / simulation.writer.contextSize.value) * 100) : 0 }}%
        TriangleAlertIcon.text-warn-500(v-if="consolidationWarning" :size="16")
        SigmaSquareIcon(
          v-else
          :size="16"
          :class="{ 'text-primary-500': variant.writerUpdate.didConsolidate }"
        )
</template>

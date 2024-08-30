<script setup lang="ts">
import CharacterPfp from "@/components/CharacterPfp.vue";
import { Simulation } from "@/lib/simulation";
import { Update } from "@/lib/simulation/update";
import { minutesToClock, tap } from "@/lib/utils";
import {
  AudioLinesIcon,
  CheckIcon,
  Edit3Icon,
  Loader2Icon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Volume2Icon,
  XIcon,
} from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { toast } from "vue3-toastify";
import RichText from "./RichText.vue";

const props = defineProps<{
  simulation: Simulation;
  variant: Update["ensureChosenVariant"];
  isSingle: boolean;
  canEdit: boolean;
  preferenceFunction: (preference: boolean | null) => Promise<void>;
  applyEditFunction: (newContent: string) => Promise<void>;
}>();

const emit = defineEmits<{
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

const clock = computed(() => {
  const minutes = props.variant.writerUpdate.simulationDayClock;
  return tap(minutes, minutesToClock);
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
    props.simulation.voicer.playTts(props.variant.ttsPath.value);
  }
}

async function createTts() {
  ttsJob = props.simulation.inferTts(props.variant);
  if (!ttsJob) return;

  ttsCreationInProgress.value = true;
  ttsJob.promise
    .then(() => {
      switchPlayTts();
    })
    .catch((e) => {
      toast("Failed to create TTS", { type: "error" });
      throw e;
    })
    .finally(() => {
      ttsCreationInProgress.value = false;
    });
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
</script>

<template lang="pug">
//- Top row.
.flex.items-center.justify-between.gap-2
  //- Character.
  .flex.items-center.gap-1
    template(v-if="character")
      CharacterPfp.aspect-square.h-5.rounded.border(
        :scenario="props.simulation.scenario"
        :character
      )
      span.font-semibold.leading-none(:style="{ color: character.color }") {{ character.name }}
    template(v-else-if="character === null")
      span.font-semibold.leading-none Narrator
    span.leading-none {{ clock }}

    //- ADHOC: Consolidation indicator.
    span.leading-none(v-if="variant.writerUpdate.didConsolidate") [C]

  //- Buttons.
  .flex.items-center.gap-2
    slot(name="extra")

    //- TTS.
    template(v-if="!editInProgress")
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
    .flex.items-center.gap-1(v-if="!editInProgress")
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
      button(v-if="!editInProgress" @click.stop="editInProgress = true")
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
div(:class="{ 'h-full overflow-y-scroll': isSingle }")
  textarea.mt-1.h-full.w-full.rounded-lg.bg-neutral-100.px-2.py-1.font-mono.text-sm.leading-snug(
    v-if="editInProgress"
    v-model="editText"
  )

  RichText(v-else :text="variant.writerUpdate.text" as="p")
</template>

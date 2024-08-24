<script setup lang="ts">
import CharacterPfp from "@/components/CharacterPfp.vue";
import * as resources from "@/lib/resources";
import { Simulation } from "@/lib/simulation";
import { Update } from "@/lib/simulation/update";
import { speechVolumeStorage } from "@/lib/storage";
import { minutesToClock, tap } from "@/lib/utils";
import { watchImmediate } from "@vueuse/core";
import {
  CheckIcon,
  CircleChevronLeft,
  CircleChevronRight,
  Edit3Icon,
  Loader2Icon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Volume2Icon,
  XIcon,
} from "lucide-vue-next";
import { computed, ref, watch } from "vue";

// TODO: Scroll text while generating new variant.
//

const props = defineProps<{
  simulation: Simulation;
  update: Update;
  canRegenerate: boolean;
  showVariantNavigation: boolean;
  canEdit: boolean;
  isSingle: boolean;
  selected?: boolean;
  updateIndex: number;
  isHistorical?: boolean;
  isFuture?: boolean;
}>();

const emit = defineEmits<{
  (event: "regenerate"): void;
  (event: "chooseVariant", variantIndex: number): void;
  (event: "edit", variantIndex: number, newContent: string): void;
  (event: "beginEdit"): void;
  (event: "stopEdit"): void;
}>();

const rootClass = computed(() => ({
  "border-red-500": props.selected,
  "border-white": !props.selected,
}));

function onClickPreviousVariant() {
  if (
    props.update.inProgressVariant.value ||
    !props.update.chosenVariantIndex.value
  ) {
    return;
  }

  tempText.value = props.update.ensureChosenVariant.writerUpdate.text;
  emit("chooseVariant", props.update.chosenVariantIndex.value - 1);
}

function onClickNextVariant() {
  if (props.update.inProgressVariant.value) {
    return;
  }

  if (
    props.update.chosenVariantIndex.value <
    props.update.variants.value.length - 1
  ) {
    tempText.value = props.update.ensureChosenVariant.writerUpdate.text;
    emit("chooseVariant", props.update.chosenVariantIndex.value + 1);
  } else {
    emit("regenerate");
  }
}

const editInProgress = ref(false);
const tempText = ref<string | undefined>();

watch(
  () => editInProgress.value,
  (editInProgress) => {
    if (editInProgress) {
      tempText.value = props.update.ensureChosenVariant.writerUpdate.text;
      emit("beginEdit");
    } else {
      emit("stopEdit");
    }
  },
);

function onEditCommitClick() {
  if (!anyEditChanges.value) {
    console.log("No changes");
    editInProgress.value = false;
    return;
  }

  emit("edit", props.update.chosenVariantIndex.value, tempText.value!.trim());
  editInProgress.value = false;
}

const anyEditChanges = computed(
  () =>
    tempText.value?.trim() !==
    props.update.chosenVariant?.writerUpdate.text.trim(),
);

const characterId = computed(() => {
  if (props.update.inProgressVariant.value) {
    return props.update.inProgressVariant.value.characterId;
  } else {
    return props.update.chosenVariant?.writerUpdate.characterId;
  }
});

const character = computed(() => {
  if (characterId.value) {
    return props.simulation.scenario.ensureCharacter(characterId.value);
  } else {
    return null;
  }
});

const clock = computed(() => {
  if (props.update.inProgressVariant.value) {
    return props.update.inProgressVariant.value.clockString;
  } else {
    const minutes = props.update.chosenVariant?.writerUpdate.simulationDayClock;
    return tap(minutes, minutesToClock);
  }
});

const preferenceInProgress = ref(false);
async function prefer(preference: boolean) {
  preferenceInProgress.value = true;

  try {
    if (
      props.update.ensureChosenVariant.writerUpdate.preference === preference
    ) {
      console.debug(
        `Preference already set to ${preference}, resetting to null`,
      );
      await props.simulation.preferWriterUpdate(props.update, null);
    } else {
      console.debug("Setting preference to", preference);
      await props.simulation.preferWriterUpdate(props.update, preference);
    }
  } finally {
    preferenceInProgress.value = false;
  }
}

const ttsInProgress = ref(false);
async function tts() {
  if (!props.update.chosenVariant) {
    return;
  }

  try {
    ttsInProgress.value = true;

    let audio = props.update.chosenVariant.ttsAudioElement;
    if (audio) {
      await audio.play();
    } else {
      let wav = await resources.tts.loadAudio(
        props.simulation.id,
        props.update.ensureChosenVariant.writerUpdate.id,
        ".wav",
      );

      if (!wav) {
        // TODO: Trigger simulation to generate TTS.
        return;
      }

      audio = props.update.chosenVariant.ttsAudioElement = new Audio(
        URL.createObjectURL(new Blob([wav], { type: "audio/wav" })),
      );

      const watchStopHandle = watchImmediate(
        () => speechVolumeStorage.value,
        (volume) => {
          audio!.volume = volume / 100;
        },
      );

      await audio.play();
      audio.onended = () => {
        watchStopHandle();
      };
    }
  } finally {
    ttsInProgress.value = false;
  }
}
</script>

<template lang="pug">
.flex.w-full.flex-col.place-self-start.rounded-lg.border-2.bg-white.px-3.py-3.opacity-90.transition-opacity(
  class="hover:opacity-100"
  :class="rootClass"
)
  //- Top row.
  .flex.items-center.justify-between.gap-2
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
      span.leading-none(
        v-if="update.chosenVariant?.writerUpdate.didConsolidate"
      ) [C]

    //- Buttons.
    .flex.items-center.gap-2
      span.text-sm.leading-none.opacity-40 \#{{ updateIndex }}({{ isHistorical ? "H" : isFuture ? "F" : "R" }})

      //- TTS.
      button.btn-pressable(
        v-if="!editInProgress"
        @click.stop="tts"
        :disabled="ttsInProgress"
      )
        Loader2Icon.animate-spin(:size="20" v-if="ttsInProgress")
        Volume2Icon(:size="20" v-else)

      .flex.items-center.gap-1(v-if="!editInProgress")
        button.btn-pressable(
          :class="{ 'text-success-500': update.chosenVariant?.writerUpdate.preference === true }"
          @click="prefer(true)"
          :disabled="preferenceInProgress"
        )
          ThumbsUpIcon(:size="18" style="margin-top: -0.3rem")

        button.btn-pressable(
          :class="{ 'text-error-500': update.chosenVariant?.writerUpdate.preference === false }"
          @click="prefer(false)"
          :disabled="preferenceInProgress"
        )
          ThumbsDownIcon(:size="18" style="margin-top: 0.3rem")

      //- Variant navigation.
      .flex.items-center.gap-1(
        v-if="!editInProgress && showVariantNavigation && !update.chosenVariant?.writerUpdate.episodeId && !editInProgress"
      )
        //- Go to previous variant.
        //- Disabled if in-progress or at the first variant.
        button.transition-transform.pressable(
          @click.stop="onClickPreviousVariant"
          :disabled="!!update.inProgressVariant.value || update.chosenVariantIndex.value === 0"
        )
          CircleChevronLeft(:size="18")

        //- Variant index.
        span.leading-none(v-if="update.inProgressVariant.value") {{ update.variants.value.length + 1 }} / {{ update.variants.value.length + 1 }}
        span.leading-none(v-else) {{ update.chosenVariantIndex.value + 1 }} / {{ update.variants.value.length }}

        //- Go to next variant.
        //- If at the latest variant, regenerate.
        //- Disabled if in-progress.
        button.transition-transform.pressable(
          @click.stop="onClickNextVariant"
          :disabled="!!update.inProgressVariant.value"
        )
          CircleChevronRight(:size="18")

      //- Edit.
      .flex(
        v-if="canEdit && !update.chosenVariant?.writerUpdate.episodeId && !update.inProgressVariant.value"
      )
        button(v-if="!editInProgress" @click.stop="editInProgress = true")
          Edit3Icon(:size="20")

        template(v-else)
          button.btn-pressable(@click.stop="onEditCommitClick")
            CheckIcon(:size="20")

          button(@click.stop="editInProgress = false")
            XIcon(:size="20")

  //- Text.
  div(:class="{ 'h-full overflow-y-scroll': isSingle }")
    p.leading-snug(v-if="update.inProgressVariant.value")
      span.-my-1.inline-block.h-5.w-2.animate-pulse.bg-black(
        style="animation-duration: 500ms"
      )

    textarea.mt-1.h-full.w-full.rounded-lg.bg-neutral-100.px-2.py-1.font-mono.text-sm.leading-snug(
      v-else-if="editInProgress"
      v-model="tempText"
    )

    p(v-else-if="update.chosenVariant?.writerUpdate") {{ update.chosenVariant.writerUpdate.text }}
</template>

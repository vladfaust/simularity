<script setup lang="ts">
import Placeholder from "@/components/Placeholder.vue";
import { TTS_SPEAKER, Tts } from "@/lib/ai/tts";
import * as resources from "@/lib/resources";
import { Simulation } from "@/lib/simulation";
import { Update } from "@/lib/simulation/update";
import { speechVolumeStorage } from "@/lib/storage";
import { v } from "@/lib/valibot";
import { asyncComputed, watchImmediate } from "@vueuse/core";
import {
  CircleCheckIcon,
  CircleChevronLeft,
  CircleChevronRight,
  CircleSlashIcon,
  Edit3Icon,
  Loader2Icon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Volume2Icon,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import Contenteditable from "vue-contenteditable";

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
  if (props.update.inProgressVariant.value) {
    return;
  }

  if (props.update.chosenVariantIndex.value) {
    rText.value = props.update.ensureChosenVariant.writerUpdate.text;
    emit("chooseVariant", props.update.chosenVariantIndex.value - 1);
  }
}

function onClickNextVariant() {
  if (props.update.inProgressVariant.value) {
    return;
  }

  if (
    props.update.chosenVariantIndex.value <
    props.update.variants.value.length - 1
  ) {
    rText.value = props.update.ensureChosenVariant.writerUpdate.text;
    emit("chooseVariant", props.update.chosenVariantIndex.value + 1);
  } else {
    emit("regenerate");
  }
}

const isContenteditable = ref(false);
const rTextElement = ref<HTMLParagraphElement | null>(null);
const rText = ref(
  props.update.inProgressVariant.value
    ? ""
    : props.update.chosenVariant?.writerUpdate.text,
);

watchImmediate(
  () => props.update.chosenVariantIndex.value,
  () => {
    if (!props.update.inProgressVariant.value) {
      rText.value = props.update.chosenVariant?.writerUpdate.text;
    }
  },
);

watchImmediate(
  () => props.update.inProgressVariant.value,
  (inProgress) => {
    if (!inProgress) {
      rText.value = props.update.chosenVariant?.writerUpdate.text;
    }
  },
);

function switchContentEditable() {
  isContenteditable.value = !isContenteditable.value;

  if (isContenteditable.value) {
    emit("beginEdit");
    if (!rTextElement.value) {
      console.warn("!rTextElement.value");
    } else {
      rTextElement.value.focus({ preventScroll: true });
    }
  } else {
    emit("stopEdit");
  }
}

function onEditCommitClick() {
  if (!rAnyChanges.value) {
    console.warn("No changes");
    return;
  }

  emit("edit", props.update.chosenVariantIndex.value, rText.value!.trim());
  isContenteditable.value = false;
  emit("stopEdit");
}

function onEditCancelClick() {
  rText.value = props.update.ensureChosenVariant.writerUpdate.text;
  isContenteditable.value = false;
  rTextElement.value!.textContent = rText.value;
  emit("stopEdit");
}

const rAnyChanges = computed(
  () =>
    rText.value?.trim() !==
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

const characterPfpUrl = asyncComputed(() =>
  characterId.value
    ? props.simulation.scenario.getCharacterPfpUrl(characterId.value)
    : undefined,
);

const clock = computed(() => {
  if (props.update.inProgressVariant.value) {
    return props.update.inProgressVariant.value.clockString;
  } else {
    const minutes = props.update.chosenVariant?.writerUpdate.simulationDayClock;
    return minutes
      ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`
      : "";
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
  ttsInProgress.value = true;
  try {
    let wav = await resources.tts.loadAudio(
      props.simulation.id,
      props.update.ensureChosenVariant.writerUpdate.id,
      ".wav",
    );

    if (!wav) {
      console.log("No cached audio, will generate new TTS");

      if (!characterId.value) {
        console.warn("No characterId");
        return;
      }

      const character = props.simulation.scenario.ensureCharacter(
        characterId.value,
      );
      if (!character.voices?.xttsV2) {
        console.warn("No voices");
        return;
      }

      const embeddingsUrl = await props.simulation.scenario.resourceUrl(
        character.voices.xttsV2.embeddingPath,
      );

      // Load embeddings as JSON.
      console.debug(`Fetching voice embeddings from ${embeddingsUrl}...`);
      const embeddings = await fetch(embeddingsUrl)
        .then((res) => res.json())
        .then((json) => v.parse(TTS_SPEAKER, json));
      console.log(`Fetched voice embeddings from ${embeddingsUrl}`);

      const ttsInstance = new Tts(import.meta.env.VITE_TTS_BASE_URL);
      console.log("Generating new TTS...");
      wav = await ttsInstance.tts({
        ...embeddings,
        text: rText.value!,
        language: "en",
      });

      await resources.tts.saveAudio(
        props.simulation.id,
        props.update.ensureChosenVariant.writerUpdate.id,
        wav,
        ".wav",
      );
    }

    // Play audio from the generated WAV.
    const audio = new Audio(
      URL.createObjectURL(new Blob([wav], { type: "audio/wav" })),
    );

    const watchStopHandle = watchImmediate(
      () => speechVolumeStorage.value,
      (volume) => {
        audio.volume = volume / 100;
      },
    );

    await audio.play();
    audio.onended = () => {
      watchStopHandle();
    };
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
        img.aspect-square.h-5.rounded.border.object-cover(
          v-if="characterPfpUrl"
          :src="characterPfpUrl"
        )
        Placeholder.aspect-square.h-5.rounded.border(v-else)
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
      button.btn-pressable(@click.stop="tts" :disabled="ttsInProgress")
        Loader2Icon.animate-spin(:size="20" v-if="ttsInProgress")
        Volume2Icon(:size="20" v-else)

      .flex.items-center.gap-1
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
        v-if="showVariantNavigation && !update.chosenVariant?.writerUpdate.episodeId && !isContenteditable"
      )
        button.transition-transform.pressable(
          @click.stop="onClickPreviousVariant"
        )
          CircleChevronLeft(:size="18")
        span.leading-none(v-if="update.inProgressVariant.value") {{ update.variants.value.length + 1 }} / {{ update.variants.value.length + 1 }}
        span.leading-none(v-else) {{ update.chosenVariantIndex.value + 1 }} / {{ update.variants.value.length }}
        button.transition-transform.pressable(@click.stop="onClickNextVariant")
          CircleChevronRight(:size="18")

      //- Edit.
      .flex(
        v-if="canEdit && !update.chosenVariant?.writerUpdate.episodeId && !update.inProgressVariant.value"
      )
        button(@click.stop="switchContentEditable")
          Edit3Icon(:size="20")

  //- Text.
  p.leading-snug(:class="{ 'h-full overflow-y-scroll': isSingle }")
    template(v-if="update.inProgressVariant.value")
      p
        | {{ update.inProgressVariant.value.text }}
        span.-my-1.inline-block.h-5.w-2.animate-pulse.bg-black(
          style="animation-duration: 500ms"
        )
    template(v-else-if="update.variants.value.length")
      Contenteditable.leading-snug(
        tag="p"
        ref="rTextElement"
        v-model="rText"
        :contenteditable="isContenteditable"
        :no-nl="true"
        :no-html="true"
        :class="{ 'font-mono bg-neutral-200 rounded p-2': isContenteditable }"
        @returned="onEditCommitClick"
      )

    //- Edit.
    .mt-2.flex.w-full.justify-center.gap-2(v-if="isContenteditable")
      button.btn.btn-warn.btn-md.btn-pressable.rounded(
        @click.stop="onEditCancelClick"
      )
        CircleSlashIcon(:size="20")
        span Cancel edit
      button.btn.btn-success.btn-md.btn-pressable.rounded(
        @click.stop="onEditCommitClick"
        :disabled="!rAnyChanges || !rText?.trim()"
      )
        CircleCheckIcon(:size="20")
        span Commit change
</template>

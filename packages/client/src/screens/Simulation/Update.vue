<script setup lang="ts">
import { Simulation } from "@/lib/simulation";
import { findCharacter } from "@/lib/simulation/scenario";
import { Update } from "@/lib/simulation/update";
import { throwError } from "@/lib/utils";
import { watchImmediate } from "@vueuse/core";
import {
  CircleCheckIcon,
  CircleChevronLeft,
  CircleChevronRight,
  CircleSlashIcon,
  Edit3Icon,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import Contenteditable from "vue-contenteditable";

// TODO: Scroll text while generating new variant.
//

const props = defineProps<{
  simulation: Simulation;
  assetBaseUrl?: URL;
  update: Update;
  canRegenerate: boolean;
  showVariantNavigation: boolean;
  canEdit: boolean;
  isSingle: boolean;
  selected?: boolean;
}>();

const emit = defineEmits<{
  (event: "regenerate", update: Update): void;
  (event: "chooseVariant", update: Update, variantIndex: number): void;
  (
    event: "edit",
    update: Update,
    variantIndex: number,
    newContent: string,
  ): void;
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
    props.update.chosenVariantIndex.value--;
    rText.value = props.update.chosenVariant!.writerUpdate.text;
    emit("chooseVariant", props.update, props.update.chosenVariantIndex.value);
  }
}

function onClickNextVariant() {
  if (props.update.inProgressVariant.value) {
    return;
  }

  if (
    props.update.chosenVariantIndex.value <
    props.update.variants.length - 1
  ) {
    props.update.chosenVariantIndex.value++;
    rText.value = props.update.chosenVariant!.writerUpdate.text;
    emit("chooseVariant", props.update, props.update.chosenVariantIndex.value);
  } else {
    emit("regenerate", props.update);
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
    if (!rTextElement.value) {
      console.warn("!rTextElement.value");
    } else {
      rTextElement.value.focus({ preventScroll: true });
    }
  }
}

function onEditCommitClick() {
  if (!rAnyChanges.value) {
    console.warn("No changes");
    return;
  }

  emit(
    "edit",
    props.update,
    props.update.chosenVariantIndex.value,
    rText.value!,
  );
  isContenteditable.value = false;
}

function onEditCancelClick() {
  rText.value = props.update.chosenVariant!.writerUpdate.text;
  isContenteditable.value = false;
  rTextElement.value!.textContent = rText.value;
}

const rAnyChanges = computed(
  () =>
    rText.value?.trim() !==
    props.update.chosenVariant?.writerUpdate.text.trim(),
);

const character = computed(() => {
  let characterId;

  if (props.update.inProgressVariant.value) {
    characterId = props.update.inProgressVariant.value.characterId;
  } else {
    characterId = props.update.chosenVariant?.writerUpdate.characterId;
  }

  if (characterId) {
    return (
      findCharacter(props.simulation.scenario, characterId) ||
      throwError(`Character not found: ${characterId}`)
    );
  } else {
    return null;
  }
});
</script>

<template lang="pug">
.flex.w-full.flex-col.place-self-start.rounded-lg.rounded-bl-none.border-2.bg-white.px-3.py-3.opacity-90.transition-opacity(
  class="hover:opacity-100"
  :class="rootClass"
)
  //- Top row.
  .flex.justify-between.gap-2
    .flex.items-center.gap-1(v-if="character")
      img.aspect-square.h-5.rounded.border.object-cover(
        :src="assetBaseUrl + character.pfp"
      )
      span.font-semibold(:style="{ color: character.displayColor }") {{ character.displayName || character.fullName }}
    template(v-else-if="character === null")
      span.font-semibold Narrator

    //- Buttons.
    .flex.items-center.gap-2(
      v-if="showVariantNavigation || canRegenerate || canEdit"
    )
      //- Variant navigation.
      .flex.items-center.gap-1(
        v-if="showVariantNavigation && !update.chosenVariant?.writerUpdate.episodeId && !isContenteditable"
      )
        button.transition-transform.pressable(@click="onClickPreviousVariant")
          CircleChevronLeft(:size="18")
        span.leading-none(v-if="update.inProgressVariant.value") {{ update.variants.length + 1 }} / {{ update.variants.length + 1 }}
        span.leading-none(v-else) {{ update.chosenVariantIndex.value + 1 }} / {{ update.variants.length }}
        button.transition-transform.pressable(@click="onClickNextVariant")
          CircleChevronRight(:size="18")

      //- Edit.
      .flex(
        v-if="canEdit && !update.chosenVariant?.writerUpdate.episodeId && !update.inProgressVariant.value"
      )
        button(@click="switchContentEditable")
          Edit3Icon(:size="20")

  //- Text.
  p.leading-snug(:class="{ 'h-full overflow-y-scroll': isSingle }")
    template(v-if="update.inProgressVariant.value")
      p
        | {{ update.inProgressVariant.value.text }}
        span.-my-1.inline-block.h-5.w-2.animate-pulse.bg-black(
          style="animation-duration: 500ms"
        )
    template(v-else-if="update.variants.length")
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
        @click="onEditCancelClick"
      )
        CircleSlashIcon(:size="20")
        span Cancel edit
      button.btn.btn-success.btn-md.btn-pressable.rounded(
        @click="onEditCommitClick"
        :disabled="!rAnyChanges || !rText?.trim()"
      )
        CircleCheckIcon(:size="20")
        span Commit change
</template>

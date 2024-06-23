<script setup lang="ts">
import { AssistantUpdate } from "@/lib/simulation/updates";
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

const props = defineProps<{
  update: AssistantUpdate;
  canRegenerate: boolean;
  showVariantNavigation: boolean;
  canEdit: boolean;
}>();

const emit = defineEmits<{
  (event: "regenerate"): void;
  (event: "chooseVariant", variantIndex: number): void;
  (event: "edit", newContent: string): void;
}>();

function onClickPreviousVariant() {
  if (props.update.newVariantInProgress.value) {
    return;
  }

  if (props.update.chosenVariantIndex.value) {
    props.update.chosenVariantIndex.value--;
    rText.value = props.update.chosenVariant.text;
  }

  emit("chooseVariant", props.update.chosenVariantIndex.value);
}

function onClickNextVariant() {
  if (props.update.newVariantInProgress.value) {
    return;
  }

  if (
    props.update.chosenVariantIndex.value <
    props.update.variants.length - 1
  ) {
    props.update.chosenVariantIndex.value++;
    rText.value = props.update.chosenVariant.text;
    emit("chooseVariant", props.update.chosenVariantIndex.value);
  } else {
    emit("regenerate");
  }
}

const isContenteditable = ref(false);
const rTextElement = ref<HTMLParagraphElement | null>(null);
const rText = ref(
  props.update.newVariantInProgress.value
    ? ""
    : props.update.chosenVariant.text,
);

watchImmediate(
  () => props.update.chosenVariantIndex.value,
  () => {
    if (!props.update.newVariantInProgress.value) {
      rText.value = props.update.chosenVariant.text;
    }
  },
);

watchImmediate(
  () => props.update.newVariantInProgress.value,
  (inProgress) => {
    if (!inProgress) {
      rText.value = props.update.chosenVariant.text;
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

  emit("edit", rText.value);
  isContenteditable.value = false;
}

function onEditCancelClick() {
  rText.value = props.update.chosenVariant.text;
  isContenteditable.value = false;
  rTextElement.value!.textContent = rText.value;
}

const rAnyChanges = computed(
  () => rText.value.trim() !== props.update.chosenVariant.text.trim(),
);
</script>

<template lang="pug">
.flex.flex-col.gap-2.place-self-start.rounded-lg.rounded-bl-none.bg-white.px-3.py-3.opacity-90.transition-opacity(
  class="hover:opacity-100"
)
  p.leading-snug
    template(v-if="update.newVariantInProgress.value")
      p
        | {{ update.inProgressVariantText.value }}
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

  .flex.items-center.gap-2(
    v-if="showVariantNavigation || canRegenerate || canEdit"
  )
    //- Variant navigation.
    .flex.items-center.gap-1(
      v-if="showVariantNavigation && !isContenteditable"
    )
      button.transition-transform.pressable(@click="onClickPreviousVariant")
        CircleChevronLeft(:size="18")
      span.leading-none(v-if="update.newVariantInProgress.value") {{ update.variants.length + 1 }} / {{ update.variants.length + 1 }}
      span.leading-none(v-else) {{ update.chosenVariantIndex.value + 1 }} / {{ update.variants.length }}
      button.transition-transform.pressable(@click="onClickNextVariant")
        CircleChevronRight(:size="18")
    //- Edit.
    .mt-2.flex.w-full.justify-center.gap-2(v-if="isContenteditable")
      button.btn.btn-warn.btn-md.btn-pressable.rounded(
        @click="onEditCancelClick"
      )
        CircleSlashIcon(:size="20")
        span Cancel edit
      button.btn.btn-success.btn-md.btn-pressable.rounded(
        @click="onEditCommitClick"
        :disabled="!rAnyChanges || !rText.trim()"
      )
        CircleCheckIcon(:size="20")
        span Commit change

    .flex(v-else-if="canEdit && !update.newVariantInProgress.value")
      button(@click="switchContentEditable")
        Edit3Icon(:size="20")
</template>

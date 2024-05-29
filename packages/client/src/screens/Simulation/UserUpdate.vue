<script setup lang="ts">
import { UserUpdate } from "@/lib/simulation/updates";
import { CircleCheckIcon, CircleSlashIcon, Edit3Icon } from "lucide-vue-next";
import { computed, ref } from "vue";
import Contenteditable from "vue-contenteditable";

const props = defineProps<{
  update: UserUpdate;
  canEdit: boolean;
}>();

const emit = defineEmits<{
  (event: "edit", newContent: string): void;
  (event: "chooseVariant", variantIndex: number): void;
}>();

const rContenteditable = ref(false);
const rTextElement = ref<HTMLParagraphElement | null>(null);
const rText = ref(props.update.chosenVariant.text);

function switchContentEditable() {
  rContenteditable.value = !rContenteditable.value;

  if (rContenteditable.value) {
    if (!rTextElement.value) {
      console.warn("!rTextElement.value");
    } else {
      rTextElement.value.focus({ preventScroll: true });
    }
  }
}

function onCommit() {
  if (!rAnyChanges.value) {
    console.warn("No changes");
    return;
  }

  console.debug(rText.value);
  emit("edit", rText.value);
  rContenteditable.value = false;
}

function onCancelClick() {
  rText.value = props.update.chosenVariant.text;
  rContenteditable.value = false;
  rTextElement.value!.textContent = rText.value;
}

const rAnyChanges = computed(
  () => rText.value.trim() !== props.update.chosenVariant.text.trim(),
);
</script>

<template lang="pug">
.flex.flex-col.place-self-end.rounded-lg.rounded-br-none.bg-white.px-3.py-3.transition-opacity(
  class="hover:opacity-100"
  :class="{ 'opacity-90': !rContenteditable, 'opacity-100': rContenteditable }"
)
  Contenteditable.leading-snug(
    tag="p"
    ref="rTextElement"
    v-model="rText"
    :contenteditable="rContenteditable"
    :no-nl="true"
    :no-html="true"
    :class="{ 'font-mono bg-neutral-200 rounded p-2': rContenteditable }"
    @returned="onCommit"
  ) {{ update.chosenVariant.text }}

  .mt-2.flex.w-full.justify-center.gap-2(v-if="rContenteditable")
    button.btn.btn-warn.btn-md.btn-pressable.rounded(@click="onCancelClick")
      CircleSlashIcon(:size="20")
      span Cancel edit
    button.btn.btn-success.btn-md.btn-pressable.rounded(
      @click="onCommit"
      :disabled="!rAnyChanges || !rText.trim()"
    )
      CircleCheckIcon(:size="20")
      span Commit change

  .flex(v-else-if="canEdit")
    button(@click="switchContentEditable")
      Edit3Icon(:size="20")
</template>

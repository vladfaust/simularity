<script setup lang="ts">
import { AssistantUpdate } from "@/lib/simulation/updates";
import { CircleChevronLeft, CircleChevronRight } from "lucide-vue-next";

const props = defineProps<{
  update: AssistantUpdate;
  canRegenerate: boolean;
  showVariantNavigation: boolean;
}>();

const emit = defineEmits<{
  (event: "regenerate"): void;
  (event: "chooseVariant", variantIndex: number): void;
}>();

function onClickPreviousVariant() {
  if (props.update.newVariantInProgress.value) {
    return;
  }

  if (props.update.chosenVariantIndex.value) {
    props.update.chosenVariantIndex.value--;
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
    emit("chooseVariant", props.update.chosenVariantIndex.value);
  } else {
    emit("regenerate");
  }
}
</script>

<template lang="pug">
.flex.flex-col.gap-2.place-self-start.rounded-lg.rounded-bl-none.bg-white.px-3.py-3.opacity-90.transition-opacity(
  class="hover:opacity-100"
)
  p.leading-snug
    template(v-if="update.newVariantInProgress.value")
      span.mr-2.inline-block.h-full.w-2.animate-pulse.bg-black(
        style="animation-duration: 500ms"
      )
    template(v-else) {{ update.chosenVariant.text }}

  .flex.items-center.gap-2(v-if="showVariantNavigation || canRegenerate")
    //- Variant navigation.
    .flex.items-center.gap-1(v-if="showVariantNavigation")
      button.transition-transform.pressable(@click="onClickPreviousVariant")
        CircleChevronLeft(:size="18")
      span.leading-none(v-if="update.newVariantInProgress.value") {{ update.variants.length + 1 }} / {{ update.variants.length + 1 }}
      span.leading-none(v-else) {{ update.chosenVariantIndex.value + 1 }} / {{ update.variants.length }}
      button.transition-transform.pressable(@click="onClickNextVariant")
        CircleChevronRight(:size="18")
</template>

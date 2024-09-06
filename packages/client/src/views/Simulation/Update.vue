<script setup lang="ts">
import { Simulation } from "@/lib/simulation";
import { Update } from "@/lib/simulation/update";
import { nonNullable } from "@/lib/utils";
import { computed } from "vue";
import InProgressUpdateVariant from "./Update/InProgressUpdateVariant.vue";
import UpdateVariant from "./Update/UpdateVariant.vue";
import VariantNavigation from "./Update/VariantNavigation.vue";

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
  emit("chooseVariant", props.update.chosenVariantIndex.value - 1);
}

function onClickNextVariant() {
  if (
    props.update.chosenVariantIndex.value <
    props.update.variants.value.length - 1
  ) {
    emit("chooseVariant", props.update.chosenVariantIndex.value + 1);
  } else {
    emit("regenerate");
  }
}
</script>

<template lang="pug">
.flex.w-full.flex-col.place-self-start.rounded-lg.border-2.bg-white.px-3.py-3.opacity-90.transition-opacity(
  class="hover:opacity-100"
  :class="rootClass"
)
  UpdateVariant(
    v-if="!update.inProgressVariant.value && update.chosenVariant"
    :key="update.chosenVariantIndex.value"
    :variant="update.chosenVariant"
    :simulation
    :is-single
    :can-edit
    :preference-function="(pref) => simulation.preferWriterUpdate(props.update, pref)"
    :apply-edit-function="(text) => simulation.editUpdateVariant(nonNullable(update.chosenVariant), text)"
    @begin-edit="emit('beginEdit')"
    @stop-edit="emit('stopEdit')"
  )
    template(#extra)
      span.text-sm.leading-none.opacity-40 \#{{ updateIndex }}({{ isHistorical ? "H" : isFuture ? "F" : "R" }})
    template(
      #variant-navigation
      v-if="!update.chosenVariant.writerUpdate.episodeId"
    )
      VariantNavigation(
        :can-go-previous="update.chosenVariantIndex.value > 0"
        :can-go-next="true"
        :current-index="update.chosenVariantIndex.value"
        :total-variants="update.variants.value.length"
        :next-will-regenerate="update.chosenVariantIndex.value === update.variants.value.length - 1"
        @previous="onClickPreviousVariant"
        @next="onClickNextVariant"
      )

  InProgressUpdateVariant(v-else-if="update.inProgressVariant.value")
    template(#extra)
      span.text-sm.leading-none.opacity-40 \#{{ updateIndex }}({{ isHistorical ? "H" : isFuture ? "F" : "R" }})
    template(#variant-navigation)
      VariantNavigation(
        :can-go-previous="false"
        :can-go-next="false"
        :current-index="update.variants.value.length"
        :total-variants="update.variants.value.length + 1"
      )
</template>

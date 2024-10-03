<script setup lang="ts">
import { Mode, Simulation } from "@/lib/simulation";
import { Update } from "@/lib/simulation/update";
import { showUpdateIds } from "@/lib/storage";
import { nonNullable } from "@/lib/utils";
import { TransitionRoot } from "@headlessui/vue";
import { computed, onMounted } from "vue";
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
  hideTts?: boolean;
  hidePreference?: boolean;
  mayChangeTtsOnMount?: boolean;
}>();

const emit = defineEmits<{
  (event: "triggerEditHandler", handler: () => void): void;
  (event: "triggerNextVariantHandler", handler: () => void): void;
  (event: "triggerPreviousVariantHandler", handler: () => void): void;
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
  if (props.update.chosenVariant?.writerUpdate.episodeId) {
    console.debug("Cannot navigate episode variant");
    return;
  }

  emit("chooseVariant", props.update.chosenVariantIndex.value - 1);
}

function onClickNextVariant() {
  if (props.update.chosenVariant?.writerUpdate.episodeId) {
    console.debug("Cannot navigate episode variant");
    return;
  }

  if (
    props.update.chosenVariantIndex.value <
    props.update.variants.value.length - 1
  ) {
    emit("chooseVariant", props.update.chosenVariantIndex.value + 1);
  } else {
    emit("regenerate");
  }
}

onMounted(() => {
  emit("triggerPreviousVariantHandler", onClickPreviousVariant);
  emit("triggerNextVariantHandler", onClickNextVariant);
});
</script>

<template lang="pug">
.relative.h-full.w-full.rounded-lg.border-2.bg-white.p-3.opacity-90.transition-opacity(
  class="hover:opacity-100"
  :class="rootClass"
)
  UpdateVariant.h-full(
    v-if="!update.inProgressVariant.value && update.chosenVariant"
    :key="update.chosenVariantIndex.value"
    :variant="update.chosenVariant"
    :simulation
    :is-single
    :can-edit
    :hide-tts
    :hide-preference
    :may-change-tts-on-mount
    :preference-function="(pref) => simulation.preferWriterUpdate(props.update, pref)"
    :apply-edit-function="(text) => simulation.editUpdateVariant(nonNullable(update.chosenVariant), text)"
    @trigger-edit-handler="emit('triggerEditHandler', $event)"
    @begin-edit="emit('beginEdit')"
    @stop-edit="emit('stopEdit')"
  )
    template(#extra)
      span.text-sm.leading-none.opacity-40(v-if="showUpdateIds") \#{{ updateIndex }}({{ isHistorical ? "H" : isFuture ? "F" : "R" }})
    template(
      #variant-navigation
      v-if="showVariantNavigation && !update.chosenVariant.writerUpdate.episodeId"
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

  TransitionRoot.h-full(
    appear
    :show="!!update.inProgressVariant.value"
    enter="duration-200 ease-out"
    enter-from="opacity-0"
    enter-to="opacity-100"
    leave="duration-200 ease-in"
    leave-from="opacity-100"
    leave-to="opacity-0"
  )
    InProgressUpdateVariant.h-full.w-full(
      :variant="update.inProgressVariant.value"
      :is-single
      :live="true"
      :translucent="simulation.mode === Mode.Immersive"
      :simulation
      :phony-preference-button="!hidePreference"
      :class="{ 'absolute left-0 top-0 p-3': !update.inProgressVariant.value }"
    )
      template(#extra)
        span.text-sm.leading-none.opacity-40(v-if="showUpdateIds") \#{{ updateIndex }}({{ isHistorical ? "H" : isFuture ? "F" : "R" }})
      template(#variant-navigation)
        VariantNavigation(
          :can-go-previous="false"
          :can-go-next="false"
          :current-index="update.variants.value.length"
          :total-variants="update.variants.value.length + 1"
        )
</template>

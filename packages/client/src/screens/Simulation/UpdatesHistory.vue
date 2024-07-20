<script setup lang="ts">
import { Simulation } from "@/lib/simulation";
import { Update } from "@/lib/simulation/update";
import { onMounted, ref, watch } from "vue";
import UpdateVue from "./Update.vue";

const { simulation } = defineProps<{
  simulation: Simulation;
  assetBaseUrl?: URL;
}>();

const emit = defineEmits<{
  (event: "chooseVariant", update: Update, variantIndex: number): void;
  (event: "regenerate", update: Update): void;
  (event: "edit", update: Update, variantIndex: number, newText: string): void;
}>();

const scrollContainer = ref<HTMLElement | null>(null);

watch(() => simulation.currentUpdateIndex.value, scrollToUpdate);

function scrollToUpdate(index: number) {
  // TODO: Pulse-animation on the update.
  if (scrollContainer.value) {
    const updateElement = scrollContainer.value.children[index] as HTMLElement;
    updateElement.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

onMounted(() => {
  scrollToUpdate(simulation.currentUpdateIndex.value);
});
</script>

<template lang="pug">
.flex.flex-col-reverse.gap-2(ref="scrollContainer")
  template(
    v-for="update, i of simulation?.updates.value"
    :key="update.parentId || 'root'"
  )
    UpdateVue(
      :simulation
      :update
      :asset-base-url
      :can-regenerate="i === 0"
      :can-edit="i === 0"
      :show-variant-navigation="i === 0"
      :is-single="false"
      :selected="i === simulation.currentUpdateIndex.value"
      @regenerate="emit('regenerate', update)"
      @edit="(_, variantIndex, newText) => emit('edit', update, variantIndex, newText)"
      @choose-variant="(_, variantIndex) => emit('chooseVariant', update, variantIndex)"
    )
</template>

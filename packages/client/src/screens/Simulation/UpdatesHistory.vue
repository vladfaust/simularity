<script setup lang="ts">
import { Simulation } from "@/lib/simulation";
import {
  AssistantUpdate,
  EpisodeUpdate,
  UserUpdate,
} from "@/lib/simulation/updates";
import { onMounted, ref, watch } from "vue";
import AssistantUpdateVue from "./AssistantUpdate.vue";
import EpisodeUpdateVue from "./EpisodeUpdate.vue";
import UserUpdateVue from "./UserUpdate.vue";

const { simulation } = defineProps<{
  simulation: Simulation;
}>();

const emit = defineEmits<{
  (
    event: "chooseAssistantVariant",
    update: AssistantUpdate,
    variantIndex: number,
  ): void;
  (event: "regenerateAssistantUpdate", update: AssistantUpdate): void;
  (event: "onUserUpdateEdit", update: UserUpdate, newText: string): void;
  (
    event: "onAssistantUpdateEdit",
    update: AssistantUpdate,
    newText: string,
  ): void;
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
    :key="update.parentId"
  )
    AssistantUpdateVue.max-w-md(
      v-if="AssistantUpdate.is(update)"
      :update="update"
      :can-regenerate="i === 0"
      :can-edit="i === 0"
      :show-variant-navigation="i === 0"
      :is-single="false"
      :selected="i === simulation.currentUpdateIndex.value"
      @regenerate="emit('regenerateAssistantUpdate', update)"
      @edit="(newText) => emit('onAssistantUpdateEdit', update, newText)"
      @choose-variant="(variantIndex) => emit('chooseAssistantVariant', update, variantIndex)"
    )
    UserUpdateVue.max-w-md(
      v-else-if="UserUpdate.is(update)"
      :update="update"
      :can-edit="i === 0 || i === 1"
      :show-variant-navigation="i === 0 || i === 1"
      :is-single="false"
      :selected="i === simulation.currentUpdateIndex.value"
      @edit="(newText) => emit('onUserUpdateEdit', update, newText)"
    )
    EpisodeUpdateVue.max-w-md(
      v-else-if="EpisodeUpdate.is(update)"
      :update="update"
      :is-single="false"
      :selected="i === simulation.currentUpdateIndex.value"
    )
</template>

<script setup lang="ts">
import {
  AssistantUpdate,
  EpisodeUpdate,
  type Update,
  UserUpdate,
} from "@/lib/simulation/updates";
import AssistantUpdateVue from "./AssistantUpdate.vue";
import EpisodeUpdateVue from "./EpisodeUpdate.vue";
import UserUpdateVue from "./UserUpdate.vue";

defineProps<{
  update: Update;
  canRegenerateAssistantUpdate: boolean;
  canEditAssistantUpdate: boolean;
  showVariantNavigation: boolean;
  canEditUserUpdate: boolean;
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

// FIXME: Duplicate due to `update` being an `Update`.
function regenerateAssistantUpdate(update: Update) {
  emit("regenerateAssistantUpdate", update as AssistantUpdate);
}

function editUserUpdate(update: Update, newText: string) {
  emit("onUserUpdateEdit", update as UserUpdate, newText);
}

function editAssistantUpdate(update: Update, newText: string) {
  emit("onAssistantUpdateEdit", update as AssistantUpdate, newText);
}

function chooseAssistantVariant(update: Update, variantIndex: number) {
  emit("chooseAssistantVariant", update as AssistantUpdate, variantIndex);
}
</script>

<template lang="pug">
AssistantUpdateVue(
  v-if="AssistantUpdate.is(update)"
  :update="update"
  :can-regenerate="canRegenerateAssistantUpdate"
  :can-edit="canEditAssistantUpdate"
  :show-variant-navigation
  :is-single="true"
  @regenerate="regenerateAssistantUpdate(update)"
  @edit="(newText) => editAssistantUpdate(update, newText)"
  @choose-variant="(variantIndex) => chooseAssistantVariant(update, variantIndex)"
)
UserUpdateVue(
  v-else-if="UserUpdate.is(update)"
  :update="update"
  :can-edit="canEditUserUpdate"
  :show-variant-navigation
  :is-single="true"
  @edit="(newText) => editUserUpdate(update, newText)"
)
EpisodeUpdateVue(
  v-else-if="EpisodeUpdate.is(update)"
  :update="update"
  :is-single="true"
)
</template>

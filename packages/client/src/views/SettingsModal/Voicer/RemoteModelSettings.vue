<script setup lang="ts">
import { useModelsQuery } from "@/queries";
import { computed } from "vue";
import Model from "./RemoteModelSettings/RemoteModel.vue";

defineProps<{
  selectedModelId: string | undefined;
}>();

defineEmits<{
  (event: "selectModel", modelId: string): void;
}>();

const modelsQuery = useModelsQuery();
const remoteModels = computed(() =>
  modelsQuery.data.value?.filter((model) => model.type === "tts"),
);
</script>

<template lang="pug">
.grid.gap-2.overflow-y-scroll.bg-neutral-50.p-2.shadow-inner
  Model.rounded-lg.border.bg-white(
    v-for="model in remoteModels"
    :key="model.id"
    :model
    :selected="model.id === selectedModelId"
    @select="() => $emit('selectModel', model.id)"
  )
</template>

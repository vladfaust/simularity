<script setup lang="ts">
import { shallowRef } from "vue";
import { onMounted } from "vue";
import * as api from "@/lib/api";
import * as storage from "@/lib/storage";
import Model from "./RemoteModelSettings/RemoteModel.vue";

defineProps<{
  selectedModelId: string | undefined;
}>();

defineEmits<{
  (event: "selectModel", modelId: string): void;
}>();

const remoteModels = shallowRef<
  Awaited<ReturnType<typeof api.v1.models.index>> | undefined
>([]);

onMounted(async () => {
  // OPTIMIZE: Memoize the API call.
  remoteModels.value = (
    await api.v1.models.index(
      import.meta.env.VITE_DEFAULT_API_BASE_URL,
      storage.remoteServerJwt.value ?? undefined,
    )
  ).filter((model) => model.type === "tts");
});
</script>

<template lang="pug">
.flex.flex-col.gap-2.overflow-y-scroll.bg-neutral-50.p-2.shadow-inner
  Model.rounded-lg.border.bg-white(
    v-for="model in remoteModels"
    :key="model.id"
    :model
    :selected="model.id === selectedModelId"
    @select="() => $emit('selectModel', model.id)"
  )
</template>

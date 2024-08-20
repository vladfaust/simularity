<script setup lang="ts">
import * as api from "@/lib/api";
import * as storage from "@/lib/storage";
import { remoteServerJwt } from "@/lib/storage";
import { onMounted, ref, shallowRef, watch } from "vue";
import Model from "./Remote/Model.vue";

const props = defineProps<{
  agentId: storage.llm.LlmAgentId;
}>();

const driverConfig = defineModel<storage.llm.LlmDriverConfig | null>(
  "driverConfig",
);

const remoteModels = shallowRef<
  Awaited<ReturnType<typeof api.v1.models.index>> | undefined
>();

const selectedModelId = ref<string | null>(
  driverConfig.value?.type === "remote" ? driverConfig.value.modelId : null,
);

const latestRemoteModelConfig = storage.llm.useLatestRemoteModelConfig(
  props.agentId,
);

function setDriverConfig(modelId: string) {
  driverConfig.value = {
    type: "remote",
    modelId,
    baseUrl: import.meta.env.VITE_DEFAULT_API_BASE_URL,
  };

  console.log("Temp driver config set", props.agentId);
}

watch(
  () => selectedModelId.value,
  (selectedModelId) => {
    if (selectedModelId) {
      setDriverConfig(selectedModelId);
    } else {
      driverConfig.value = null;
    }
  },
);

onMounted(async () => {
  // OPTIMIZE: Memoize the API call.
  remoteModels.value = (
    await api.v1.models.index(
      import.meta.env.VITE_DEFAULT_API_BASE_URL,
      remoteServerJwt.value ?? undefined,
    )
  ).filter((model) => model.task === props.agentId);

  if (driverConfig.value?.type !== "remote") {
    if (latestRemoteModelConfig.value) {
      setDriverConfig(latestRemoteModelConfig.value.modelId);
    }
  }

  if (driverConfig.value?.type === "remote") {
    selectedModelId.value = driverConfig.value.modelId;
  }
});
</script>

<template lang="pug">
.flex.w-full.flex-col.gap-2
  .grid.grid-cols-2.gap-2
    Model.rounded-lg.border(
      v-for="model in remoteModels"
      :key="model.id"
      :class="{ 'border-primary-500': selectedModelId === model.id }"
      :model
      :selected="selectedModelId === model.id"
      @select="selectedModelId = model.id"
    )
</template>

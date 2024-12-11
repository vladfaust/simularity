<script setup lang="ts">
import { env } from "@/env";
import * as storage from "@/lib/storage";
import {
  useRemoteLlmModelsQuery,
  useRemoteWellKnownLlmModelsQuery,
} from "@/queries";
import { computed, onMounted, ref, watch } from "vue";
import Model from "./Remote/Model.vue";

const props = defineProps<{
  agentId: storage.llm.LlmAgentId;
}>();

const driverConfig = defineModel<storage.llm.LlmDriverConfig | null>(
  "driverConfig",
);

const { data: actualRemoteModels } = useRemoteLlmModelsQuery(props.agentId);
const { data: wellKnownRemoteModels } =
  useRemoteWellKnownLlmModelsQuery("writer");

const matchingModels = computed(() =>
  actualRemoteModels.value && wellKnownRemoteModels.value
    ? (actualRemoteModels.value
        .map((actualModel) => {
          const wellKnownModel = Object.entries(
            wellKnownRemoteModels.value!,
          ).find(([id, _]) => id === actualModel.id);

          if (wellKnownModel) {
            return {
              id: actualModel.id,
              actual: actualModel,
              wellKnown: wellKnownModel[1],
            };
          } else {
            return null;
          }
        })
        .filter((v) => v !== null) as {
        id: string;
        actual: (typeof actualRemoteModels.value)[number];
        wellKnown: (typeof wellKnownRemoteModels.value)[number];
      }[])
    : undefined,
);

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
    baseUrl: env.VITE_API_BASE_URL,
    completionOptions:
      wellKnownRemoteModels.value?.[modelId]?.recommendedParameters,
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
.flex.flex-col.gap-3.overflow-x-hidden.overflow-y-scroll.p-3
  Model.w-full.rounded-lg.bg-white.shadow-lg(
    v-for="model in matchingModels"
    :key="model.id"
    :class="{ 'border-primary-500': selectedModelId === model.id }"
    :actual="model.actual"
    :well-known="model.wellKnown"
    :selected="selectedModelId === model.id"
    @select="selectedModelId = model.id"
  )
</template>

<script setup lang="ts">
import Alert from "@/components/Alert.vue";
import * as storage from "@/lib/storage";
import { useRemoteLlmModelsQuery } from "@/queries";
import { onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import Model from "./Remote/Model.vue";

const props = defineProps<{
  agentId: storage.llm.LlmAgentId;
}>();

const driverConfig = defineModel<storage.llm.LlmDriverConfig | null>(
  "driverConfig",
);

const { data: remoteModels } = useRemoteLlmModelsQuery(props.agentId);

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
    baseUrl: import.meta.env.VITE_API_BASE_URL,
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

const { t } = useI18n({
  messages: {
    "en-US": {
      settings: {
        llmAgentModel: {
          remote: {
            delayAlert:
              "At this moment inference may be slow at first due to server cold start. This will be improved in the future.",
          },
        },
      },
    },
    "ru-RU": {
      settings: {
        llmAgentModel: {
          remote: {
            delayAlert:
              "В данный момент инференс может быть медленным из-за холодного старта сервера. Это будет улучшено в будущем.",
          },
        },
      },
    },
  },
});
</script>

<template lang="pug">
.grid.gap-2.overflow-y-scroll.bg-neutral-50.p-2.shadow-inner
  Alert.bg-white(type="info") {{ t("settings.llmAgentModel.remote.delayAlert") }}
  Model.rounded-lg.border.bg-white(
    v-for="model in remoteModels"
    :key="model.id"
    :class="{ 'border-primary-500': selectedModelId === model.id }"
    :model
    :selected="selectedModelId === model.id"
    @select="selectedModelId = model.id"
  )
</template>

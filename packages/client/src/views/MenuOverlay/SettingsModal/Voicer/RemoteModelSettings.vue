<script setup lang="ts">
import Alert from "@/components/Alert.vue";
import { useRemoteTtsModelsQuery } from "@/queries";
import { useI18n } from "vue-i18n";
import Model from "./RemoteModelSettings/RemoteModel.vue";

defineProps<{
  selectedModelId: string | undefined;
}>();

defineEmits<{
  (event: "selectModel", modelId: string): void;
}>();

const { data: remoteModels } = useRemoteTtsModelsQuery();

const { t } = useI18n({
  messages: {
    "en-US": {
      settings: {
        voicer: {
          remoteModel: {
            serverDelayTooltip:
              "At this moment inference may be slow at first due to server cold start. This will be improved in the future.",
          },
        },
      },
    },
    "ru-RU": {
      settings: {
        voicer: {
          remoteModel: {
            serverDelayTooltip:
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
  Alert.bg-white(type="info") {{ t("settings.voicer.remoteModel.serverDelayTooltip") }}

  Model.rounded-lg.border.bg-white(
    v-for="model in remoteModels"
    :key="model.id"
    :model
    :selected="model.id === selectedModelId"
    @select="() => $emit('selectModel', model.id)"
  )
</template>

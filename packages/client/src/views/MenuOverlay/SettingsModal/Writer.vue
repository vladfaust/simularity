<script setup lang="ts">
import Alert from "@/components/Alert.vue";
import InteractiveHelper from "@/components/InteractiveHelper.vue";
import RichInput from "@/components/RichForm/RichInput.vue";
import RichToggle from "@/components/RichForm/RichToggle.vue";
import { Simulation } from "@/lib/simulation";
import * as storage from "@/lib/storage";
import {
  FeatherIcon,
  MessageSquareTextIcon,
  Settings2Icon,
} from "lucide-vue-next";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import LlmAgentModel from "./LlmAgent/LlmAgentModel.vue";

defineProps<{
  simulation?: Simulation;
}>();

const driverConfig = defineModel<storage.llm.LlmDriverConfig | null>(
  "driverConfig",
);

const selectedModel = ref<storage.llm.CachedModel | null>();

const { t } = useI18n({
  messages: {
    "en-US": {
      settings: {
        writer: {
          writerHelp:
            "Writer agent is responsible, among other tasks, for generating the story. Writer is required for the simulation to function. It has to be a capable model trained for roleplay. Bigger context size allows to go on with the story for longer without the need to consolidate.",
          showUpdateIds: "Show update IDs",
          nEval: "Message length limit",
          nEvalHelp: "Maximum number of tokens in a single message",
          model: "Model",
          modelContextSizeAlert:
            "Model is trained on up to {maxContextSize} tokens. Consider reducing the context size to avoid performance degradation.",
          scenarioContextSizeAlert:
            "Scenario requires at least {contextSize} tokens of context. Consider increasing the context size to avoid context overflow.",
        },
      },
    },
    "ru-RU": {
      settings: {
        writer: {
          writerHelp:
            "Писатель отвечает, среди прочих задач, за генерацию истории. Он необходим для функционирования симуляции. Писатель должен быть способной моделью, обученной для ролевых игр. Больший размер контекста позволяет продолжать историю дольше без необходимости консолидации.",
          showUpdateIds: "Показывать ID обновлений",
          nEval: "Лимит длины сообщения",
          nEvalHelp: "Максимальное количество токенов в одном сообщении",
          model: "Модель",
          modelContextSizeAlert:
            "Модель обучена на {maxContextSize} токенов. Уменьшите контекст, чтобы избежать снижения производительности.",
          scenarioContextSizeAlert:
            "Сценарий требует как минимум {contextSize} токенов контекста. Увеличьте контекст, чтобы избежать переполнения.",
        },
      },
    },
  },
});
</script>

<template lang="pug">
.flex.flex-col
  InteractiveHelper.border-b(:show-background="false")
    Alert.bg-white(type="info")
      p.text-sm.leading-tight {{ t("settings.writer.writerHelp") }}

  .flex.flex-col.gap-2.p-3
    .flex.flex-col.gap-2.rounded-lg.bg-white.p-3.shadow-lg
      //- Show update IDs.
      //- TODO: Only in development mode.
      RichToggle#show-update-ids(
        :title="t('settings.writer.showUpdateIds')"
        v-model="storage.showUpdateIds.value"
      )
        template(#icon)
          Settings2Icon(:size="16")

      //- Message length limit.
      RichInput#n-eval(
        :title="t('settings.writer.nEval')"
        :help="t('settings.writer.nEvalHelp')"
      )
        template(#icon)
          MessageSquareTextIcon(:size="16")
        input.rounded-lg.border.px-2.py-1.text-sm(
          type="number"
          min="32"
          max="512"
          v-model="storage.llm.writerNEval.value"
        )

    LlmAgentModel(
      agent-id="writer"
      :driver-instance="simulation?.writer.llmDriver.value ?? undefined"
      :has-cache="true"
      v-model:driver-config="driverConfig"
      v-model:selected-model="selectedModel"
      :recommended-context-size="simulation?.scenario.content.contextWindowSize"
    )
      template(#title)
        .flex.shrink-0.items-center(class="gap-1.5")
          .btn.rounded-lg.border.bg-white.p-1
            FeatherIcon(:size="18")
          h2.shrink-0.font-semibold.leading-tight.tracking-wide {{ t("settings.writer.model") }}

      template(#context-size-help="{ contextSize, maxContextSize }")
        //- Trained context size alert.
        Alert.bg-white(type="warn" v-if="contextSize > maxContextSize")
          i18n-t(tag="span" keypath="settings.writer.modelContextSizeAlert")
            template(#maxContextSize) {{ maxContextSize }}

        //- Scenario context size alert.
        Alert.bg-white(
          type="warn"
          v-if="simulation && contextSize < simulation.scenario.content.contextWindowSize"
        )
          i18n-t(keypath="settings.writer.scenarioContextSizeAlert")
            template(#contextSize) {{ simulation?.scenario.content.contextWindowSize }}
</template>

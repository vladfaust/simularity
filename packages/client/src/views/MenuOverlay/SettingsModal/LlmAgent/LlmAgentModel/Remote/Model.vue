<script setup lang="ts">
import * as api from "@/lib/api";
import { appLocale } from "@/lib/storage";
import { prettyNumber } from "@/lib/utils";
import { translationWithFallback } from "@/logic/i18n";
import { CircleDollarSignIcon, ProportionsIcon } from "lucide-vue-next";
import { useI18n } from "vue-i18n";

defineProps<{
  model: Awaited<
    ReturnType<typeof api.trpc.commandsClient.models.indexLlmModels.query>
  >[number];
  selected: boolean;
}>();

defineEmits<{
  (event: "select"): void;
}>();

const { t } = useI18n({
  messages: {
    "en-US": {
      settings: {
        llmAgentModel: {
          remote: {
            contextSize: {
              label: "Ctx",
              tooltip: "Maximum context size for a this model",
            },
            price: {
              label: "Price",
              tooltip: "Per 1024 tokens",
            },
            select: "Select",
            selected: "Selected",
          },
        },
      },
    },
    "ru-RU": {
      settings: {
        llmAgentModel: {
          remote: {
            contextSize: {
              label: "Контекст",
              tooltip: "Максимальный размер контекста для этой модели",
            },
            price: {
              label: "Цена",
              tooltip: "За 1024 токена",
            },
            select: "Выбрать",
            selected: "Выбрано",
          },
        },
      },
    },
  },
});
</script>

<template lang="pug">
.flex.flex-col.gap-2.p-3
  .flex.flex-col.gap-1
    span.text-center.text-lg.font-semibold.leading-tight.tracking-wide {{ model.name }}
    p.text-center.text-sm.leading-tight(v-if="model.description") {{ translationWithFallback(model.description, appLocale) }}

    //- Params.
    .flex.flex-wrap.items-center.justify-center.gap-x-2.text-sm
      .flex.gap-1(
        v-tooltip="t('settings.llmAgentModel.remote.contextSize.tooltip')"
      )
        ProportionsIcon.self-center(:size="18" :stroke-width="2.5")
        span.self-baseline
          span.font-semibold {{ t("settings.llmAgentModel.remote.contextSize.label") }}:
          |
          | {{ prettyNumber(model.contextSize, { space: false }) }}t

      .flex.gap-1.text-sm
        CircleDollarSignIcon.self-center(:size="18" :stroke-width="2.5")
        span.self-baseline
          span.font-semibold {{ t("settings.llmAgentModel.remote.price.label") }}:&nbsp;
          span.font-mono.font-medium.text-secondary-500 {{ model.creditPrice }}¢&nbsp;
          span.cursor-help.underline.decoration-dashed(
            v-tooltip="t('settings.llmAgentModel.remote.price.tooltip')"
          ) /{{ prettyNumber(1024, { space: false }) }}t

  //- Buttons
  button.btn.btn-sm.w-full.rounded.transition-transform.pressable(
    :class="{ 'btn-primary': selected, 'btn-neutral': !selected }"
    @click="$emit('select')"
  )
    span {{ selected ? t("settings.llmAgentModel.remote.selected") : t("settings.llmAgentModel.remote.select") }}
</template>

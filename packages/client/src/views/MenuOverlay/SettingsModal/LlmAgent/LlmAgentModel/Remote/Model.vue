<script setup lang="ts">
import SubscriptionIcon from "@/components/Icons/SubscriptionIcon.vue";
import Placeholder from "@/components/Placeholder.vue";
import RichTitle from "@/components/RichForm/RichTitle.vue";
import * as api from "@/lib/api";
import { appLocale } from "@/lib/storage";
import { prettyNumber } from "@/lib/utils";
import { SUPPORTED_LOCALES, translationWithFallback } from "@/logic/i18n";
import type { WellKnownRemoteModel } from "@/queries";
import {
  BrainCircuitIcon,
  LanguagesIcon,
  ProportionsIcon,
} from "lucide-vue-next";
import { useI18n } from "vue-i18n";

defineProps<{
  actual: Awaited<
    ReturnType<typeof api.trpc.commandsClient.models.indexLlmModels.query>
  >[number];
  wellKnown: WellKnownRemoteModel;
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
            requiredSubscriptionTier: {
              basic: "Basic subscription required",
              premium: "Premium subscription required",
            },
            contextSize: {
              label: "Ctx",
              tooltip: "Maximum context size for a this model",
            },
            locales: {
              label: "Lang",
              tooltip: "Languages the model has been trained on",
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
            requiredSubscriptionTier: {
              basic: "Требуется базовая подписка",
              premium: "Требуется премиум подписка",
            },
            contextSize: {
              label: "Контекст",
              tooltip: "Максимальный размер контекста для этой модели",
            },
            locales: {
              label: "Языки",
              tooltip: "Языки, на которых обучена модель",
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
.flex.items-stretch
  .w-48.border-r.p-3
    img.h-full.w-full.rounded-lg.bg-white.object-cover.shadow(
      v-if="wellKnown.imgUrl"
      :src="wellKnown.imgUrl"
      alt="Model image"
    )
    Placeholder.h-full.w-full.rounded-lg.bg-white.shadow(v-else)
      BrainCircuitIcon.opacity-25(:size="32")

  .flex.w-full.flex-col.justify-center
    //- Info.
    .flex.flex-col.gap-y-1.p-3
      RichTitle(:hide-border="!actual.requiredSubscriptionTier")
        span.font-semibold.leading-tight.tracking-wide {{ actual.name }}
        template(#extra v-if="actual.requiredSubscriptionTier")
          SubscriptionIcon.cursor-help(
            v-tooltip="t(`settings.llmAgentModel.remote.requiredSubscriptionTier.${actual.requiredSubscriptionTier}`)"
            :tier="actual.requiredSubscriptionTier"
            :size="18"
          )

      p.text-sm.leading-tight(v-if="actual.description") {{ translationWithFallback(actual.description, appLocale) }}

      //- Params.
      .flex.flex-wrap.items-center.gap-x-2.text-sm
        //- Context size.
        .flex.cursor-help.gap-1(
          v-tooltip="t('settings.llmAgentModel.remote.contextSize.tooltip')"
        )
          ProportionsIcon.self-center(:size="18" :stroke-width="2.5")
          span.self-baseline
            span.font-semibold {{ t("settings.llmAgentModel.remote.contextSize.label") }}:
            |
            | {{ prettyNumber(actual.contextSize, { space: false }) }}t

        //- Locales.
        .flex.cursor-help.gap-1(
          v-if="wellKnown.locales"
          v-tooltip="t('settings.llmAgentModel.remote.locales.tooltip')"
        )
          LanguagesIcon.self-center(:size="18" :stroke-width="2.5")
          .flex.gap-1
            span.font-semibold {{ t("settings.llmAgentModel.remote.locales.label") }}:
            span {{ wellKnown.locales.map((l) => SUPPORTED_LOCALES[l.toString()].label).join(", ") }}

    //- Buttons
    .border-t.p-3
      button.btn.btn-sm.w-full.rounded.border.transition-transform.pressable(
        :class="{ 'btn-primary': selected, 'btn-neutral': !selected }"
        @click="$emit('select')"
      )
        span {{ selected ? t("settings.llmAgentModel.remote.selected") : t("settings.llmAgentModel.remote.select") }}
</template>

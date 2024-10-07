<script setup lang="ts">
import * as api from "@/lib/api";
import { appLocale } from "@/lib/storage";
import { translationWithFallback } from "@/logic/i18n";
import { CircleDollarSignIcon } from "lucide-vue-next";
import { useI18n } from "vue-i18n";

defineProps<{
  model: Awaited<
    ReturnType<typeof api.trpc.commandsClient.models.indexTtsModels.query>
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
        voicer: {
          remoteModel: {
            price: {
              label: "Price",
              chars: "chars",
            },
            select: "Select",
            selected: "Selected",
          },
        },
      },
    },
    "ru-RU": {
      settings: {
        voicer: {
          remoteModel: {
            price: {
              label: "Цена",
              chars: "0 символов | {n} символ | {n} символа | {n} символов",
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
  .flex.flex-col.items-center.gap-1
    span.font-bold.leading-tight.tracking-wide {{ model.name }}
    p.text-center.text-sm.leading-tight(v-if="model.description") {{ translationWithFallback(model.description, appLocale) }}
    .flex.gap-1.text-sm
      CircleDollarSignIcon.self-center(:size="18" :stroke-width="2.5")
      span.self-baseline
        span.font-semibold {{ t("settings.voicer.remoteModel.price.label") }}:&nbsp;
        span.font-mono.font-medium.text-secondary-500 {{ model.creditPrice }}¢
        span &nbsp;/ {{ t("settings.voicer.remoteModel.price.chars", 1000) }}

  //- Buttons
  button.btn.btn-sm.w-full.rounded.transition-transform.pressable-sm(
    :class="{ 'btn-primary': selected, 'btn-neutral': !selected }"
    @click="$emit('select')"
  )
    span {{ selected ? t("settings.voicer.remoteModel.selected") : t("settings.voicer.remoteModel.select") }}
</template>

<script setup lang="ts">
import RichSelect from "@/components/RichForm/RichSelect.vue";
import * as storage from "@/lib/storage";
import { SUPPORTED_LOCALE_SELECT_VALUES } from "@/logic/i18n";
import { LanguagesIcon, MessagesSquareIcon } from "lucide-vue-next";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

const appLocaleStringRef = computed({
  get: () => storage.appLocale.value.toString(),
  set: (value) => {
    storage.appLocale.value = new Intl.Locale(value);
  },
});

const chatLocaleStringRef = computed({
  get: () => storage.chatLocale.value.toString(),
  set: (value) => {
    storage.chatLocale.value = new Intl.Locale(value);
  },
});

const { t } = useI18n({
  messages: {
    "en-US": {
      settings: {
        application: {
          interfaceLanguage: "Interface language",
          chatLanguage: "Default chat language",
          chatLanguageHelp: "Language support varies per scenario & model",
        },
      },
    },
    "ru-RU": {
      settings: {
        application: {
          interfaceLanguage: "Язык интерфейса",
          chatLanguage: "Язык чата по умолчанию",
          chatLanguageHelp: "Поддержка языков зависит от сценария и модели",
        },
      },
    },
  },
});
</script>

<template lang="pug">
.flex.flex-col
  .flex.flex-col.gap-2.p-3
    .flex.flex-col.gap-2.rounded-lg.bg-white.p-3.shadow-lg
      RichSelect#interface-language(
        :title="t('settings.application.interfaceLanguage')"
        v-model="appLocaleStringRef"
        :values="SUPPORTED_LOCALE_SELECT_VALUES"
      )
        template(#icon)
          LanguagesIcon(:size="16")

      RichSelect#chat-language(
        :title="t('settings.application.chatLanguage')"
        v-model="chatLocaleStringRef"
        :values="SUPPORTED_LOCALE_SELECT_VALUES"
        :help="t('settings.application.chatLanguageHelp')"
      )
        template(#icon)
          MessagesSquareIcon(:size="16")
</template>

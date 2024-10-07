<script setup lang="ts">
import { type Scenario } from "@/lib/scenario";
import { appLocale } from "@/lib/storage";
import { SUPPORTED_LOCALES, translationWithFallback } from "@/logic/i18n";
import { DramaIcon, LanguagesIcon, ScrollTextIcon } from "lucide-vue-next";
import { useI18n } from "vue-i18n";

defineProps<{
  scenario: Scenario;
  showAttributes?: boolean;
}>();

const { t } = useI18n({
  messages: {
    "en-US": {
      scenarioDetails: {
        context: "Minimum context size for a model",
        languages: "Languages",
        episodes: "Episodes",
        achievements: "Achievements",
        characters: "Characters",
        scenes: "Scenes",
        version: "Version",
      },
    },
    "ru-RU": {
      scenarioDetails: {
        context: "Минимальный размер контекста для модели",
        languages: "Языки",
        episodes: "Эпизоды",
        achievements: "Достижения",
        characters: "Персонажи",
        scenes: "Сцены",
        version: "Версия",
      },
    },
  },
});
</script>

<template lang="pug">
.flex.flex-col
  p.col-span-2.text-sm.italic.leading-tight {{ translationWithFallback(scenario.about, appLocale) }}

  ul.flex.flex-wrap.gap-1
    li.rounded-lg.border.px-1.text-xs(v-for="tag of scenario.tags") \#{{ tag }}

  .flex.flex-wrap.gap-x-3.text-sm(v-if="showAttributes")
    .flex.items-center.gap-1
      LanguagesIcon(:size="16")
      span.shrink-0.font-semibold {{ t("scenarioDetails.languages") }}:
      span {{ scenario.locales.map((l) => SUPPORTED_LOCALES[l.toString()].label).join(", ") }}

    //- .flex.cursor-help.items-center.gap-1.underline.decoration-dashed(
    //-   :title="t('scenarioDetails.context')"
    //- )
    //-   ProportionsIcon(:size="16")
    //-   span.shrink-0.font-semibold {{ t('scenarioDetails.context') }}:
    //-   span {{ prettyNumber(scenario.contextWindowSize, { space: false }) }}

    .flex.items-center.gap-1
      ScrollTextIcon(:size="16")
      span.shrink-0.font-semibold {{ t("scenarioDetails.episodes") }}:
      span {{ Object.keys(scenario.episodes).length }}

    //- .flex.items-center.gap-1
    //-   TrophyIcon(:size="16")
    //-   span.shrink-0.font-semibold {{ t('scenarioDetails.achievements') }}:
    //-   span {{ scenario.achievements ? Object.keys(scenario.achievements).length : 0 }}

    .flex.items-center.gap-1
      DramaIcon(:size="16")
      span.shrink-0.font-semibold {{ t("scenarioDetails.characters") }}:
      span {{ Object.keys(scenario.characters).length }}

    //- template(v-if="scenario instanceof LocalImmersiveScenario && true")
    //-   .flex.items-center.gap-1
    //-     ImageIcon(:size="16")
    //-     span.shrink-0.font-semibold {{ t('scenarioDetails.scenes') }}:
    //-     span {{ Object.keys(scenario.scenes).length }}

  .flex.text-xs
    span.italic.leading-tight {{ t("scenarioDetails.version") }}: {{ scenario.version }}
</template>

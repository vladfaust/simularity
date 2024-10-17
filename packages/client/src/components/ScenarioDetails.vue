<script setup lang="ts">
import { type Scenario } from "@/lib/scenario";
import { appLocale } from "@/lib/storage";
import { prettyNumber } from "@/lib/utils";
import type { v } from "@/lib/valibot";
import { SUPPORTED_LOCALES, translationWithFallback } from "@/logic/i18n";
import type { SubscriptionTierSchema } from "@simularity/api/lib/schema";
import {
  BookUpIcon,
  DramaIcon,
  LanguagesIcon,
  PackageIcon,
  ProportionsIcon,
  ScrollTextIcon,
} from "lucide-vue-next";
import prettyBytes from "pretty-bytes";
import { useI18n } from "vue-i18n";

defineProps<{
  scenario: Scenario;
  requiredSubscriptionTier?: v.InferOutput<
    typeof SubscriptionTierSchema
  > | null;
  showAttributes?: boolean;
  diskSize?: number;
}>();

const { t } = useI18n({
  messages: {
    "en-US": {
      scenarioDetails: {
        contextSize: "Context",
        contextSizeHelp: "Minimum required model context window size",
        languages: "Languages",
        episodes: "Episodes",
        achievements: "Achievements",
        characters: "Characters",
        scenes: "Scenes",
        version: "Version",
        diskSize: "Size",
      },
    },
    "ru-RU": {
      scenarioDetails: {
        contextSize: "Контекст",
        contextSizeHelp: "Минимальный требуемый размер окна контекста модели",
        languages: "Языки",
        episodes: "Эпизоды",
        achievements: "Достижения",
        characters: "Персонажи",
        scenes: "Сцены",
        version: "Версия",
        diskSize: "Размер",
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

    .flex.cursor-help.items-center.gap-1(
      v-tooltip="t('scenarioDetails.contextSizeHelp')"
    )
      ProportionsIcon(:size="16")
      span.shrink-0.font-semibold {{ t("scenarioDetails.contextSize") }}:
      span {{ prettyNumber(scenario.contextWindowSize, { space: false }) }}

    .flex.items-center.gap-1
      BookUpIcon(:size="16")
      span.shrink-0.font-semibold {{ t("scenarioDetails.version") }}:
      span {{ scenario.version }}

    .flex.items-center.gap-1(v-if="diskSize")
      PackageIcon(:size="16")
      span.shrink-0.font-semibold {{ t("scenarioDetails.diskSize") }}:
      span {{ prettyBytes(diskSize) }}

    //- template(v-if="scenario instanceof LocalImmersiveScenario && true")
    //-   .flex.items-center.gap-1
    //-     ImageIcon(:size="16")
    //-     span.shrink-0.font-semibold {{ t('scenarioDetails.scenes') }}:
    //-     span {{ Object.keys(scenario.scenes).length }}
</template>

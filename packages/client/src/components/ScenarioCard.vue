<script setup lang="ts">
import ImmersiveModeIcon from "@/components/Icons/ImmersiveModeIcon.vue";
import NsfwIcon from "@/components/NsfwIcon.vue";
import Placeholder from "@/components/Placeholder.vue";
import RichTitle from "@/components/RichForm/RichTitle.vue";
import { env } from "@/env";
import { Download, downloadManager } from "@/lib/downloads";
import {
  LocalImmersiveScenario,
  RemoteScenario,
  type Scenario,
} from "@/lib/scenario";
import { appLocale } from "@/lib/storage";
import type { v } from "@/lib/valibot";
import { translationWithFallback } from "@/logic/i18n";
import { TransitionRoot } from "@headlessui/vue";
import type { SubscriptionTierSchema } from "@simularity/api/lib/schema";
import { asyncComputed, useElementHover } from "@vueuse/core";
import {
  CheckIcon,
  DownloadIcon,
  Loader2Icon,
  MonitorIcon,
} from "lucide-vue-next";
import prettyBytes from "pretty-bytes";
import { onMounted, ref, shallowRef } from "vue";
import { useI18n } from "vue-i18n";
import SubscriptionIcon from "./Icons/SubscriptionIcon.vue";

const card = ref<HTMLElement | null>(null);
const isHovered = useElementHover(card);

const props = defineProps<{
  layout: "grid" | "list";
  narrowPadding?: boolean;
  alwaysHideDetails?: boolean;
  scenario: Scenario;
  requiredSubscriptionTier?: v.InferOutput<
    typeof SubscriptionTierSchema
  > | null;
}>();

const thumbnailUrl = asyncComputed(() => {
  return props.scenario.getThumbnailUrl();
});

const download = shallowRef<Download | null>(null);

onMounted(async () => {
  const regex = RegExp(`^(?<version>\\d+).${props.scenario.id}.scenario$`);

  for (const instance of downloadManager.downloads.values()) {
    const match = instance.id.match(regex);

    if (match) {
      const version = parseInt(match.groups!.version);
      console.log("Found download for scenario", { version });
      download.value = instance;
      break;
    }
  }
});

const { t } = useI18n({
  messages: {
    "en-US": {
      scenarioCard: {
        inLibrary: "In library",
        nsfw: "This scenario is NSFW",
        immersive: "This scenario supports visual novel mode",
        requiredSubscriptionTier: {
          basic: "Basic subscription required",
          premium: "Premium subscription required",
        },
      },
    },
    "ru-RU": {
      scenarioCard: {
        inLibrary: "В библиотеке",
        nsfw: "Этот сценарий NSFW",
        immersive: "Этот сценарий поддерживает режим визуальной новеллы",
        requiredSubscriptionTier: {
          basic: "Требуется базовая подписка",
          premium: "Требуется премиум-подписка",
        },
      },
    },
  },
});
</script>

<template lang="pug">
//- Grid layout.
.group.relative.overflow-hidden(
  v-if="layout === 'grid'"
  ref="card"
  class="aspect-[3/4]"
)
  img.h-full.w-full.select-none.object-cover.transition(
    class="hover:brightness-105"
    v-if="thumbnailUrl"
    :src="thumbnailUrl"
  )
  Placeholder.h-full.w-full(v-else)

  //- Details.
  TransitionRoot.absolute.bottom-0.left-0.z-10.w-full(
    :show="!alwaysHideDetails && isHovered"
    enter="duration-200 ease-out"
    enter-from="translate-y-full opacity-0"
    enter-to="translate-y-0 opacity-100"
    leave="duration-100 ease-in"
    leave-from="translate-y-0 opacity-100"
    leave-to="translate-y-full opacity-0"
  )
    .flex.h-max.w-full.flex-col.justify-between.gap-1.bg-white(
      v-if="scenario"
      :class="{ 'p-3': !narrowPadding, 'px-2 py-3': narrowPadding }"
    )
      //- Top.
      .flex.flex-col
        RichTitle(:title="translationWithFallback(scenario.name, appLocale)")
          template(#extra)
            .flex.gap-1
              //- Subscription icon.
              SubscriptionIcon.cursor-help(
                v-if="requiredSubscriptionTier"
                :tier="requiredSubscriptionTier"
                :size="18"
                v-tooltip="t(`scenarioCard.requiredSubscriptionTier.${requiredSubscriptionTier}`)"
              )

              //- NSFW icon.
              NsfwIcon.cursor-help.text-pink-500(
                v-if="scenario.nsfw"
                :size="18"
                v-tooltip="t('scenarioCard.nsfw')"
              )

              //- Immersive mode icon.
              MonitorIcon.cursor-help(
                v-if="scenario instanceof LocalImmersiveScenario && true"
                :size="18"
                v-tooltip="t('scenarioCard.immersive')"
              )

        p.text-sm.leading-snug {{ scenario.teaser }}

      //- Bottom.
      ul.flex.flex-wrap.gap-1
        li.rounded-lg.border.px-1.text-xs(v-for="tag of scenario.tags") \#{{ tag }}

//- List layout.
.group.flex.bg-white(v-else class="@container")
  //- Thumbnail.
  .hidden.aspect-square.w-32.overflow-hidden(class="@xs:block")
    img.h-full.w-full.select-none.rounded-lg.object-cover.transition(
      class="group-hover:blur-none group-hover:brightness-105"
      v-if="thumbnailUrl"
      :src="thumbnailUrl"
    )
    Placeholder.h-full.w-full(v-else)

  //- Details.
  .flex.w-full.flex-col.justify-between.gap-1.px-3.py-2(v-if="scenario")
    //- Top.
    .flex.flex-col
      RichTitle(:title="translationWithFallback(scenario.name, appLocale)")
        template(#extra)
          .flex.gap-1
            //- Subscription icon.
            SubscriptionIcon.cursor-help(
              v-if="requiredSubscriptionTier"
              :tier="requiredSubscriptionTier"
              :size="18"
              v-tooltip="t(`scenarioCard.requiredSubscriptionTier.${requiredSubscriptionTier}`)"
            )

            //- NSFW icon.
            NsfwIcon.cursor-help.text-pink-500(
              v-if="scenario.nsfw"
              :size="18"
              v-tooltip="t('scenarioCard.nsfw')"
            )

            //- Immersive mode icon.
            ImmersiveModeIcon.cursor-help(
              v-if="env.VITE_EXPERIMENTAL_IMMERSIVE_MODE && scenario.immersive"
              :size="18"
              v-tooltip="t('scenarioCard.immersive')"
            )
      p.text-sm.leading-snug {{ translationWithFallback(scenario.teaser, appLocale) }}

    //- Bottom.
    .flex.items-center.justify-between
      ul.flex.flex-wrap.gap-1
        li.rounded-lg.border.px-1.text-xs(v-for="tag of scenario.tags") \#{{ tag }}

      .hidden.shrink-0(class="@xs:block")
        .flex.items-center.gap-1(v-if="download")
          Loader2Icon(
            :size="16"
            :class="{ 'animate-spin': !download.paused.value }"
          )
          span.text-xs.font-medium {{ prettyBytes(download.totalFileSize.value) }} ({{ Math.round(download.progress.value * 100) }}%)

        .flex.items-center.gap-1(
          v-else-if="scenario instanceof RemoteScenario && true"
        )
          DownloadIcon(:size="16")
          span.text-xs.font-medium {{ prettyBytes(scenario.downloadSize) }}

        .flex.items-center.gap-1(v-else)
          CheckIcon.text-success-500(:size="16")
          span.text-xs.font-medium {{ t("scenarioCard.inLibrary") }}
</template>

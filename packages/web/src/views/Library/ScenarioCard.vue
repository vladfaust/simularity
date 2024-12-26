<script setup lang="ts">
import NsfwIcon from "@/components/Icons/NsfwIcon.vue";
import SubscriptionIcon from "@/components/Icons/SubscriptionIcon.vue";
import TransitionImage from "@/components/TransitionImage.vue";
import { translateWithFallback } from "@/lib/logic/i18n";
import { remoteScenarioAssetUrl } from "@/lib/logic/scenarios";
import { useRemoteScenarioQuery } from "@/lib/queries";
import { appLocale } from "@/store";
import { useI18n } from "vue-i18n";

const { scenarioId } = defineProps<{
  scenarioId: string;
  animateOnHover?: boolean;
  showDetails?: boolean;
}>();

const { data: scenario } = useRemoteScenarioQuery(scenarioId);

const { t } = useI18n({
  messages: {
    en: {
      scenarioCard: {
        nsfw: "This scenario is NSFW",
        requiresSubscription: {
          basic: "Requires Basic subscription",
          premium: "Requires Premium subscription",
        },
      },
    },
  },
});
</script>

<template lang="pug">
.group.relative.flex.flex-col.overflow-hidden(class="aspect-[3/4]" v-if="scenario")
  TransitionImage.h-full.w-full.object-cover.transition(
    v-if="scenario.thumbnail"
    :src="remoteScenarioAssetUrl(scenarioId, scenario.version, scenario.thumbnail.path)"
    :class="{ 'group-hover:scale-105 group-hover:brightness-105': animateOnHover }"
  )

  .absolute.bottom-0.z-10.hidden.w-full.pb-2.pl-2(v-if="showDetails" class="xs:block")
    .flex.flex-col.gap-1.rounded-l-lg.p-3.shadow-lg.backdrop-blur(class="bg-white/90")
      .flex.shrink-0.items-center.justify-between.gap-2
        //- Title.
        span.shrink-0.text-lg.font-semibold.leading-tight {{ translateWithFallback(scenario.name, appLocale) }}

        .w-full.border-b

        //- Buttons.
        .flex.shrink-0.items-center.gap-1
          .btn.shrink-0.cursor-help.rounded-lg.border.bg-white.p-1(
            v-if="scenario.requiredSubscriptionTier"
            v-tooltip="t(`scenarioCard.requiresSubscription.${scenario.requiredSubscriptionTier}`)"
          )
            SubscriptionIcon(
              :tier="scenario.requiredSubscriptionTier"
              :size="16"
            )

          .btn.shrink-0.cursor-help.rounded-lg.border.bg-white.p-1(
            v-if="scenario.nsfw"
            v-tooltip="t('scenarioCard.nsfw')"
          )
            NsfwIcon.cursor-help.text-pink-500(:size="16")

      p.text-sm.leading-tight {{ translateWithFallback(scenario.teaser, appLocale) }}
      .flex.text-xs
      ul.flex.flex-wrap.gap-1
        li.rounded-lg.border.px-1.text-xs(v-for="tag of scenario.tags") \#{{ tag }}
</template>

<style lang="scss" scoped>
._scenario-card-details {
  // Apply transition mask, so that it goes from 0 to 100% opacity, vertically.
  mask-image: linear-gradient(to bottom, transparent 0%, black 100%);
}
</style>

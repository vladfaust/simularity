<script setup lang="ts">
import HeaderVue from "@/components/Header.vue";
import NsfwIcon from "@/components/Icons/NsfwIcon.vue";
import SubscriptionIcon from "@/components/Icons/SubscriptionIcon.vue";
import RichTitle from "@/components/RichForm/RichTitle.vue";
import TransitionImage from "@/components/TransitionImage.vue";
import { translateWithFallback } from "@/lib/logic/i18n";
import { remoteScenarioAssetUrl } from "@/lib/logic/scenarios";
import { useRemoteScenarioQuery } from "@/lib/queries";
import { routeLocation } from "@/router";
import { appLocale } from "@/store";
import {
  AppWindowIcon,
  ArrowLeftIcon,
  DramaIcon,
  ScrollTextIcon,
} from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import ScenarioCard from "./Library/ScenarioCard.vue";
import CharacterCard from "./Scenario/CharacterCard.vue";
import EpisodeCard from "./Scenario/EpisodeCard.vue";
import ScenarioDetails from "./Scenario/ScenarioDetails.vue";

const { scenarioId } = defineProps<{
  scenarioId: string;
}>();

const { data: scenario } = useRemoteScenarioQuery(scenarioId);

const { t } = useI18n({
  messages: {
    "en-US": {
      scenario: {
        loading: "Loading...",
        requiresSubscription: {
          basic: "Requires Basic subscription",
          premium: "Requires Premium subscription",
        },
        episodes: "Episodes",
        characters: "Characters",
        openScenario: "Open in app",
        isNsfw: "This scenario contains NSFW content",
      },
    },
  },
});
</script>

<template lang="pug">
.flex.h-screen.flex-col
  .flex.flex-col.items-center
    HeaderVue.w-full.border-b

  .flex.w-full.flex-col.items-center.border-b.bg-white.p-3
    .flex.w-full.max-w-4xl.items-center.justify-between.gap-2
      RouterLink.flex.w-max.shrink-0.origin-left.items-center.gap-2.transition.pressable-sm(
        :to="routeLocation({ name: 'Home' })"
        class="py-[2px]"
      )
        .grid.place-items-center.rounded-lg.border.p-1
          ArrowLeftIcon(:size="20")
        span.text-lg.font-semibold {{ scenario ? translateWithFallback(scenario.name, appLocale) : t("scenario.loading") }}

      .h-0.w-full.border-b

      .flex.items-center.gap-2(
        v-if="scenario?.requiredSubscriptionTier || scenario?.nsfw"
      )
        //- Subscription tier.
        .btn.aspect-square.shrink-0.cursor-help.rounded-lg.border.border-dashed(
          v-if="scenario?.requiredSubscriptionTier"
          class="p-1.5"
          v-tooltip="t(`scenario.requiresSubscription.${scenario.requiredSubscriptionTier}`)"
        )
          SubscriptionIcon(
            :tier="scenario?.requiredSubscriptionTier"
            :size="20"
          )

        //- Nsfw.
        .btn.aspect-square.shrink-0.cursor-help.rounded-lg.border.border-dashed.text-pink-500(
          v-if="scenario?.nsfw"
          class="p-1.5"
          v-tooltip="t('scenario.isNsfw')"
        )
          NsfwIcon(:size="20")

  .relative.flex.h-full.flex-col.items-center.overflow-hidden
    TransitionImage.absolute.-z-10.h-full.w-full.scale-105.rounded-b-lg.object-cover.blur(
      v-if="scenario?.coverImage"
      :src="remoteScenarioAssetUrl(scenarioId, scenario.version, scenario.coverImage.path)"
    )

    .grid.h-full.w-full.max-w-4xl.gap-3.overflow-y-scroll.p-3.shadow-inner(
      v-if="scenario"
      class="bg-white/90 sm:grid-cols-3 sm:overflow-y-hidden sm:p-0"
    )
      .flex.h-full.w-full.flex-col.gap-3(
        class="xs:flex-row sm:flex-col sm:overflow-y-scroll sm:py-3 sm:pl-3"
      )
        ScenarioCard.w-full.rounded-lg.border-4.border-white.shadow-lg(
          :scenario-id
        )

        //- Play button.
        RouterLink.btn.btn-primary.btn-pressable.btn-lg.shrink-0.rounded-lg.shadow-lg(
          :to="routeLocation({ name: 'Download', query: { scenarioId } })"
        )
          AppWindowIcon(:size="20")
          | {{ t("scenario.openScenario") }}

        ScenarioDetails.h-max.gap-2.rounded-lg.bg-white.p-3.shadow-lg(
          :scenario-id
          :show-attributes="true"
        )

      .flex.h-full.flex-col.gap-2(
        class="@container sm:col-span-2 sm:overflow-y-scroll sm:py-3 sm:pr-3"
      )
        template(v-if="Object.keys(scenario.episodes).length > 1")
          //- Episodes.
          RichTitle(:title="t('scenario.episodes')")
            template(#icon)
              ScrollTextIcon(:size="18")
            template(#extra)
              span {{ Object.keys(scenario.episodes).length }}

          //- Episodes grid.
          .grid.w-full.grid-cols-2.gap-2(class="md:grid-cols-3")
            //- TODO: New game modal offers download if not yet downloaded.
            EpisodeCard.cursor-pointer.overflow-hidden.rounded-lg.border-4.border-white.bg-white.shadow-lg.transition-transform.pressable(
              v-for="episodeId in Object.keys(scenario.episodes)"
              :key="scenarioId + episodeId"
              :scenario-id
              :episode-id
            )

        //- Characters.
        RichTitle(:title="t('scenario.characters')")
          template(#icon)
            DramaIcon(:size="18")
          template(#extra)
            span {{ Object.keys(scenario.characters).length }}

        //- Characters grid.
        .grid.gap-2(class="md:grid-cols-2")
          CharacterCard.overflow-hidden.rounded-lg.border-4.border-white.bg-white.shadow-lg(
            v-for="characterId in Object.keys(scenario.characters)"
            :key="scenarioId + characterId"
            :scenario-id
            :character-id
          )
</template>

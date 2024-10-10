<script setup lang="ts">
import HeaderVue from "@/components/Header.vue";
import NsfwIcon from "@/components/Icons/NsfwIcon.vue";
import { useRemoteScenariosQuery } from "@/lib/queries";
import { routeLocation } from "@/router";
import { useLocalStorage } from "@vueuse/core";
import { LibraryBigIcon } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import ScenarioCard from "./Library/ScenarioCard.vue";

const showNsfw = useLocalStorage("showNsfw", false);
const { data: scenarios } = useRemoteScenariosQuery(
  showNsfw,
  undefined,
  undefined,
);

const { t } = useI18n({
  messages: {
    "en-US": {
      scenarios: {
        label: "Library",
        showNsfwButton: {
          title: "Show NSFW scenarios",
        },
      },
    },
  },
});
</script>

<template lang="pug">
.flex.h-screen.flex-col.overflow-y-hidden
  .flex.flex-col.items-center
    HeaderVue.w-full.border-b

  .flex.w-full.flex-col.items-center.border-b.bg-white.p-3
    .flex.w-full.max-w-4xl.items-center.justify-between.gap-2
      RouterLink.flex.w-max.shrink-0.origin-left.items-center.gap-2.transition.pressable-sm(
        :to="routeLocation({ name: 'Home' })"
      )
        .grid.place-items-center.rounded-lg.border.p-1
          LibraryBigIcon(:size="20")
        span.text-lg.font-semibold {{ t("scenarios.label") }}

      .w-full.border-b

      button.btn.btn-pressable.aspect-square.shrink-0.rounded-lg.border(
        class="p-1.5"
        :class="{ 'text-pink-500': showNsfw }"
        @click="showNsfw = !showNsfw"
        :title="t('scenarios.showNsfwButton.title')"
      )
        NsfwIcon(:size="20")

  .flex.h-full.w-full.flex-col.items-center.overflow-y-scroll.bg-neutral-100.p-3.shadow-inner
    .grid.w-full.max-w-4xl.grid-cols-1.gap-3(class="2xs:grid-cols-2 sm:grid-cols-3")
      RouterLink.contents.shrink-0(
        v-for="scenarioId in scenarios"
        :to="routeLocation({ name: 'Scenario', params: { scenarioId } })"
      )
        ScenarioCard.cursor-pointer.rounded-lg.border-4.border-white.shadow-lg.transition-transform.pressable-sm(
          :key="scenarioId"
          :scenario-id
          :animate-on-hover="true"
          :show-details="true"
        )
</template>

<script setup lang="ts">
import HeaderVue from "@/components/Header.vue";
import { translateWithFallback } from "@/lib/logic/i18n";
import { useLatestReleaseQuery, useRemoteScenarioQuery } from "@/lib/queries";
import { sleep } from "@/lib/utils";
import { routeLocation } from "@/router";
import { appLocale } from "@/store";
import { onMounted } from "vue";
import { useRoute } from "vue-router";
import WrapBalancer from "vue-wrap-balancer";
import ScenarioCard from "./Library/ScenarioCard.vue";

const scenarioId = useRoute().query.scenarioId as string | undefined;
const { data: scenario } = useRemoteScenarioQuery(scenarioId);
const { data: latestRelease } = useLatestReleaseQuery();

onMounted(async () => {
  if (scenarioId) {
    await sleep(1000);
    window.location.href = `simularity://open/scenarios/${scenarioId}`;
  }
});
</script>

<template lang="pug">
.flex.h-screen.flex-col.overflow-y-hidden
  .flex.flex-col.items-center
    HeaderVue.w-full.border-b

  .flex.h-full.flex-col.items-center.overflow-y-scroll.bg-neutral-100.p-3
    .flex.h-full.w-full.max-w-4xl.flex-col.items-center.gap-3
      .flex.flex-col.items-center.gap-2(v-if="scenarioId")
        WrapBalancer.text-center.text-lg.leading-snug(v-if="scenario")
          | Opening
          |
          span.font-semibold.tracking-wide {{ translateWithFallback(scenario.name, appLocale) }}
          |
          | in the Simularity application...

        RouterLink(
          :to="routeLocation({ name: 'Scenario', params: { scenarioId } })"
        )
          ScenarioCard.w-48.cursor-pointer.rounded-lg.border-4.border-white.shadow-lg.transition-transform.pressable-sm(
            :scenario-id="scenarioId"
          )

      WrapBalancer.text-center.leading-snug
        template(v-if="scenarioId") Don't have the application yet? Download it now:
        template(v-else) Download Simularity application to run scenarios locally:

      .flex.flex-col.items-center.gap-2(v-if="latestRelease")
        a._platform-button(
          v-if="latestRelease.platforms['windows-x86_64']"
          :href="latestRelease.platforms['windows-x86_64'].url"
          target="_blank"
        )
          img.h-6(src="/img/windows.svg" alt="Windows")
          | Windows x86_64 (CUDA)

        a._platform-button(
          v-if="latestRelease.platforms['darwin-arm64']"
          :href="latestRelease.platforms['darwin-arm64'].url"
          target="_blank"
        )
          img.-mt-1.h-6(src="/img/apple.svg" alt="MacOS")
          | MacOS arm64 (Metal)
</template>

<style lang="postcss" scoped>
._platform-button {
  @apply btn btn-lg btn-pressable flex w-max items-center justify-center rounded-lg bg-white shadow-lg;
}
</style>

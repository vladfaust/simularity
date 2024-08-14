<script setup lang="ts">
import Placeholder from "@/components/Placeholder.vue";
import { routeLocation } from "@/lib/router";
import { Simulation } from "@/lib/simulation";
import { readScenario, Scenario } from "@/lib/simulation/scenario";
import { asyncComputed } from "@vueuse/core";
import { ArrowLeft, CirclePlayIcon } from "lucide-vue-next";
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import WrapBalancer from "vue-wrap-balancer";
import Character from "./NewGame/Character.vue";
import Episode from "./NewGame/Episode.vue";

const router = useRouter();

const props = defineProps<{
  scenarioId: string;
}>();

const scenario = ref<Scenario | undefined>();

const thumbnailUrl = asyncComputed(() => scenario.value?.getThumbnailUrl());
const coverImageUrl = asyncComputed(() => scenario.value?.getCoverImageUrl());

async function play(episodeId?: string) {
  const simulationId = await Simulation.create(props.scenarioId, episodeId);

  router.push(
    routeLocation({
      name: "Simulation",
      params: { simulationId },
    }),
  );
}

onMounted(async () => {
  console.log("props.scenarioId", props.scenarioId);
  const read = await readScenario(props.scenarioId);

  if (read instanceof Scenario) {
    scenario.value = read;
  } else {
    throw new Error(JSON.stringify(read));
  }
});
</script>

<template lang="pug">
.flex.h-screen.flex-col.overflow-y-hidden
  .flex.justify-between.border-b.p-3
    RouterLink.btn.btn-md.rounded-lg.border.transition-transform.pressable(
      :to="routeLocation({ name: 'ChooseScenario' })"
    )
      ArrowLeft(:size="20")
      span Back

  template(v-if="scenario && scenario instanceof Scenario && true")
    .flex.h-full.flex-col.overflow-y-scroll
      img.static.h-48.w-full.select-none.border-b.object-cover(
        v-if="coverImageUrl"
        :src="coverImageUrl"
      )
      Placeholder.h-48.w-full.border-b(v-else)

      .flex.flex-col.items-center.gap-2.px-3.pb-3
        img.-mt-20.aspect-square.w-40.select-none.rounded-lg.border-4.border-white.object-cover.shadow-lg(
          v-if="thumbnailUrl"
          :src="thumbnailUrl"
        )
        Placeholder.-mt-20.aspect-square.w-40(v-else)

        .flex.flex-col.items-center(class="gap-1.5")
          h1.text-xl.font-bold.leading-snug.tracking-wider {{ scenario.name }}
          WrapBalancer.max-w-sm.text-center.leading-tight(as="p") {{ scenario.about }}

          button.btn.btn-md.btn-primary.mt-1.rounded-lg.shadow.transition-transform.pressable(
            @click="play()"
          )
            CirclePlayIcon.drop-shadow(:size="20" :stroke-width="2.5")
            span Play

          h2.text-lg.font-semibold.leading-snug.tracking-wide Description
          WrapBalancer.max-w-lg.text-center.text-sm.leading-tight(as="p") {{ scenario.description }}
          .flex.gap-1.text-sm
            span
              | Language:
              |
              b.font-mono {{ scenario.language }}
            span •
            span
              | Context size:
              |
              b.font-mono {{ scenario.contextWindowSize }}

          h2.text-lg.font-semibold.leading-snug.tracking-wide Characters ({{ Object.keys(scenario.characters).length }})
          //- TODO: Use flex-wrap instead of grid.
          .grid.max-w-lg.gap-2(
            class="max-sm:grid-cols-3 max-2xs:grid-cols-2 max-3xs:grid-cols-1 sm:grid-cols-4"
          )
            Character.overflow-hidden.rounded-lg.border(
              v-for="[characterId, character] in Object.entries(scenario.characters)"
              :key="characterId"
              :scenario
              :characterId
              :character
            )

          h2.text-lg.font-semibold.leading-snug.tracking-wide Episodes ({{ Object.keys(scenario.episodes).length }})
          //- TODO: Use flex-wrap instead of grid.
          .grid.w-full.max-w-lg.gap-2(
            class="max-2xs:grid-cols-2 max-3xs:grid-cols-1 2xs:grid-cols-3"
          )
            Episode.cursor-pointer.overflow-hidden.rounded-lg.border.transition-transform.pressable(
              v-for="[episodeId, episode] in Object.entries(scenario.episodes)"
              :key="episodeId"
              :scenario
              :episodeId
              :episode
              @click="play(episodeId)"
            )
</template>

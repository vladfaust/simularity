<script setup lang="ts">
import EpisodeCard from "@/components/EpisodeCard.vue";
import ImmersiveModeIcon from "@/components/Icons/ImmersiveModeIcon.vue";
import SandboxModeIcon from "@/components/Icons/SandboxModeIcon.vue";
import Modal from "@/components/Modal.vue";
import Placeholder from "@/components/Placeholder.vue";
import RichTitle from "@/components/RichForm/RichTitle.vue";
import RichToggle from "@/components/RichForm/RichToggle.vue";
import ScenarioCard from "@/components/ScenarioCard.vue";
import { env } from "@/env";
import { trackEvent } from "@/lib/plausible";
import {
  LocalImmersiveScenario,
  RemoteScenario,
  type Scenario,
} from "@/lib/scenario";
import { Mode, Simulation } from "@/lib/simulation";
import { allSavesQueryKey } from "@/queries";
import router, { routeLocation } from "@/router";
import { useQueryClient } from "@tanstack/vue-query";
import { asyncComputed, useElementSize, watchImmediate } from "@vueuse/core";
import { SparkleIcon } from "lucide-vue-next";
import { computed, ref, watch } from "vue";

const queryClient = useQueryClient();

const props = defineProps<{
  open: boolean;
  scenario: Scenario;
  episodeId?: string;
}>();

const emit = defineEmits<{
  (event: "selectEpisode", episodeId: string): void;
  (event: "close"): void;
}>();

const selectedEpisodeId = ref<string>(
  props.episodeId ?? props.scenario.defaultEpisodeId,
);

const selectedEpisode = computed(
  () => props.scenario.episodes[selectedEpisodeId.value],
);

const selectedEpisodeImageUrl = asyncComputed(() =>
  selectedEpisode.value?.image
    ? props.scenario.resourceUrl(selectedEpisode.value.image.path)
    : null,
);

const immersiveMode = ref(
  env.VITE_EXPERIMENTAL_IMMERSIVE_MODE
    ? props.scenario instanceof LocalImmersiveScenario
    : false,
);
const sandboxMode = ref(false);

const detailsRef = ref<HTMLElement | null>(null);
const detailsSize = useElementSize(detailsRef);
const helperRef = ref<HTMLElement | null>(null);
const helperSize = useElementSize(helperRef);

async function play(episodeId?: string | null) {
  const simulationId = await Simulation.create(
    props.scenario.id,
    immersiveMode.value ? Mode.Immersive : Mode.Chat,
    sandboxMode.value,
    episodeId ?? undefined,
  );

  queryClient.invalidateQueries({ queryKey: allSavesQueryKey() });

  trackEvent("simulations/create", {
    props: {
      scenarioId: props.scenario.id,
      episodeId: episodeId ?? "",
      immersive: immersiveMode.value,
      sandbox: sandboxMode.value,
    },
  });

  router.push(
    routeLocation({
      name: "Simulation",
      params: { simulationId },
    }),
  );
}

watch(props, (props) => {
  selectedEpisodeId.value = props.episodeId ?? props.scenario.defaultEpisodeId;
});

watchImmediate(selectedEpisodeId, (episodeId) => {
  // Track episode selection.
  trackEvent("newGameModal", {
    props: {
      scenarioId: props.scenario.id,
      episodeId,
    },
  });
});
</script>

<template lang="pug">
Modal.max-h-full.w-full.max-w-5xl.rounded-lg(
  class="bg-white/90"
  :open
  @close="emit('close')"
  title="New game"
)
  template(#icon)
    SparkleIcon(:size="22")

  .relative.max-h-full.overflow-hidden(
    :style="{ height: 'calc(' + detailsSize.height.value + 'px)' }"
  )
    .pointer-events-none.absolute.h-full.w-full(ref="helperRef")
    .grid.max-h-full.grid-cols-5.divide-x.overflow-y-hidden(
      :style="{ height: helperSize.height.value + 'px' }"
    )
      //- Episode selection.
      .col-span-2.flex.h-full.flex-col.overflow-y-scroll.contain-size
        .border-b.p-3
          ScenarioCard.overflow-hidden.rounded-lg.bg-white.shadow-lg.shadow-lg(
            :scenario
            :always-hide-details="true"
            layout="list"
          )

        .grid.max-h-full.grid-cols-2.gap-2.p-3
          EpisodeCard.h-max.cursor-pointer.rounded-lg.border-4.bg-white.shadow-lg(
            v-for="episodeId in Object.keys(scenario.episodes)"
            :scenario
            :episode-id
            :selected="selectedEpisodeId === episodeId"
            @click.stop="selectedEpisodeId = episodeId; emit('selectEpisode', episodeId)"
            :class="{ 'border-primary-500': selectedEpisodeId === episodeId, 'border-white': selectedEpisodeId !== episodeId }"
          )

      //- Episode details.
      .col-span-3.h-full.overflow-y-scroll
        .flex.h-max.flex-col.divide-y(ref="detailsRef")
          .flex.flex-col.gap-2.p-3
            img.aspect-video.rounded-lg.border-4.border-white.object-cover.shadow-lg(
              v-if="selectedEpisodeImageUrl"
              :src="selectedEpisodeImageUrl"
            )
            Placeholder.aspect-video.w-full.rounded-lg.border-4.bg-white.shadow-lg.shadow-lg(
              v-else
            )

            .mt-1.px-1
              RichTitle(:title="selectedEpisode.name" :hide-border="true")
              p.leading-snug {{ selectedEpisode.about }}

          .flex.flex-col.gap-2.p-3(
            v-if="env.VITE_EXPERIMENTAL_IMMERSIVE_MODE && !(scenario instanceof RemoteScenario)"
          )
            RichToggle#immersive(
              title="Immersive mode"
              help="In immersive mode, you can play the simulation as a visual novel."
              v-model="immersiveMode"
              :disabled="!(scenario instanceof LocalImmersiveScenario)"
            )
              template(#icon)
                ImmersiveModeIcon(:size="20")

            RichToggle#sandbox(
              title="Sandbox mode"
              help="In sandbox mode, you get full control over the simulation."
              v-model="sandboxMode"
            )
              template(#icon)
                SandboxModeIcon(:size="20")

  .col-span-full.border-t.p-3
    .btn.btn-md.w-full.rounded-lg.border.border-dashed(
      v-if="scenario instanceof RemoteScenario && true"
    )
      | Download scenario to play
    button.btn.btn-pressable-sm.btn-primary.btn-md.w-full.rounded-lg(
      v-else
      :disabled="!selectedEpisodeId"
      @click="play(selectedEpisodeId)"
    )
      | Start game
</template>

<style lang="postcss" scoped>
._mode-button {
  @apply btn btn-sm w-full p-2;

  &._selected {
    @apply btn-primary;
  }
}
</style>

<script setup lang="ts">
import EpisodeCard from "@/components/EpisodeCard.vue";
import ChatModeIcon from "@/components/Icons/ChatModeIcon.vue";
import ImmersiveModeIcon from "@/components/Icons/ImmersiveModeIcon.vue";
import Modal from "@/components/Modal.vue";
import Placeholder from "@/components/Placeholder.vue";
import RichTitle from "@/components/RichForm/RichTitle.vue";
import ScenarioCard from "@/components/ScenarioCard.vue";
import { Mode, Simulation, type Scenario } from "@/lib/simulation";
import { ImmersiveScenario } from "@/lib/simulation/scenario";
import router, { routeLocation } from "@/router";
import { asyncComputed, useElementSize } from "@vueuse/core";
import { SparkleIcon } from "lucide-vue-next";
import { computed, ref, watch } from "vue";

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
  () => props.scenario.content.episodes[selectedEpisodeId.value],
);

const selectedEpisodeImageUrl = asyncComputed(() =>
  selectedEpisode.value?.imagePath
    ? props.scenario.resourceUrl(selectedEpisode.value.imagePath)
    : null,
);

const mode = ref(
  props.scenario instanceof ImmersiveScenario ? Mode.Immersive : Mode.Chat,
);

const detailsRef = ref<HTMLElement | null>(null);
const detailsSize = useElementSize(detailsRef);
const helperRef = ref<HTMLElement | null>(null);
const helperSize = useElementSize(helperRef);

async function play(episodeId?: string | null) {
  const simulationId = await Simulation.create(
    props.scenario.id,
    mode.value,
    episodeId ?? undefined,
  );

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
    :style="{ height: 'calc(' + detailsSize.height.value + 'px + 1.5rem)' }"
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
            v-for="episodeId in Object.keys(scenario.content.episodes)"
            :scenario
            :episode-id
            :selected="selectedEpisodeId === episodeId"
            @click.stop="selectedEpisodeId = episodeId; emit('selectEpisode', episodeId)"
            :class="{ 'border-primary-500': selectedEpisodeId === episodeId, 'border-white': selectedEpisodeId !== episodeId }"
          )

      //- Episode details.
      .col-span-3.h-full.overflow-y-scroll.p-3
        .flex.h-max.flex-col.gap-2(ref="detailsRef")
          img.aspect-video.rounded-lg.border-4.border-white.object-cover.shadow-lg(
            v-if="selectedEpisodeImageUrl"
            :src="selectedEpisodeImageUrl"
          )
          Placeholder.aspect-video.w-full.rounded-lg.border-4.bg-white.shadow-lg.shadow-lg(
            v-else
          )

          .my-1.px-1
            RichTitle(:title="selectedEpisode.name" :hide-border="true")
            p.leading-snug {{ selectedEpisode.about }}

          .flex.divide-x.overflow-hidden.rounded-lg.border.bg-white
            .w-full
              button._mode-button(
                @click="mode = Mode.Chat"
                :class="{ _selected: mode === Mode.Chat }"
              )
                ChatModeIcon(:size="20")
                | Chat mode

            .w-full
              button._mode-button(
                @click="mode = Mode.Immersive"
                :class="{ _selected: mode === Mode.Immersive }"
                :disabled="!(scenario instanceof ImmersiveScenario)"
              )
                ImmersiveModeIcon(:size="20")
                | Immersive mode

  .col-span-full.border-t.p-3
    button.btn.btn-pressable-sm.btn-primary.btn-md.w-full.rounded-lg(
      :disabled="!selectedEpisodeId"
      @click="play(selectedEpisodeId)"
    )
      | Start game
</template>

<style lang="scss" scoped>
._mode-button {
  @apply btn btn-sm w-full p-2;

  &._selected {
    @apply text-primary-500;
  }
}
</style>

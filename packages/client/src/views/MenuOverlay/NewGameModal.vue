<script setup lang="ts">
import CustomTitle from "@/components/CustomTitle.vue";
import EpisodeCard from "@/components/EpisodeCard.vue";
import ChatModeIcon from "@/components/Icons/ChatMode.vue";
import ImmersiveModeIcon from "@/components/Icons/ImmersiveMode.vue";
import Modal from "@/components/Modal.vue";
import ScenarioCard from "@/components/ScenarioCard.vue";
import { Mode, Simulation, type Scenario } from "@/lib/simulation";
import { ImmersiveScenario } from "@/lib/simulation/scenario";
import router, { routeLocation } from "@/router";
import { asyncComputed } from "@vueuse/core";
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
Modal.h-full.w-full.max-w-5xl.rounded-lg(
  class="bg-white/90"
  :open
  @close="emit('close')"
  title="New game"
)
  template(#icon)
    SparkleIcon(:size="22")

  .grid.h-full.grid-cols-5.divide-x.overflow-y-hidden
    //- Episode selection.
    .col-span-2.flex.h-full.flex-col.overflow-y-scroll
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
    .col-span-3.flex.h-full.flex-col.gap-2.overflow-y-scroll.p-3
      img.aspect-video.rounded-lg.border-4.border-white.object-cover.shadow-lg(
        v-if="selectedEpisodeImageUrl"
        :src="selectedEpisodeImageUrl"
      )

      .my-1.px-1
        CustomTitle(:title="selectedEpisode.name" :hide-border="true")
        p.leading-snug {{ selectedEpisode.about }}

      .flex.divide-x.overflow-hidden.rounded-lg.rounded-lg.border.bg-white
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

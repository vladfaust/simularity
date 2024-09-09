<script setup lang="ts">
import Alert from "@/components/Alert.vue";
import CustomTitle from "@/components/CustomTitle.vue";
import Modal from "@/components/Modal.vue";
import { Mode, Simulation, type Scenario } from "@/lib/simulation";
import { ImmersiveScenario } from "@/lib/simulation/scenario";
import router, { routeLocation } from "@/router";
import { asyncComputed } from "@vueuse/core";
import {
  BookMarkedIcon,
  MessagesSquareIcon,
  MonitorIcon,
  PlayCircleIcon,
  Settings2Icon,
} from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import ScenarioVue from "../Library/Scenario.vue";
import Episode from "./Episode.vue";

const props = defineProps<{
  open: boolean;
  scenario: Scenario;
  episodeId?: string;
}>();

const emit = defineEmits<{
  (event: "close"): void;
}>();

const selectedEpisodeId = ref<string>(
  props.episodeId ?? props.scenario.defaultEpisodeId,
);
watch(
  () => props.episodeId,
  (episodeId) => {
    selectedEpisodeId.value = episodeId ?? props.scenario.defaultEpisodeId;
  },
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
</script>

<template lang="pug">
Modal.max-h-full.w-full.max-w-2xl.rounded-lg(
  :open
  @close="emit('close')"
  title="New game"
)
  template(#icon)
    PlayCircleIcon(:size="22")

  .flex.h-full.flex-col.divide-y.overflow-y-scroll
    //- Scenario details.
    .bg-neutral-100.p-3
      ScenarioVue.overflow-hidden.rounded-lg.bg-white.shadow-lg(
        :scenario
        :no-blur-nsfw="true"
        layout="list"
      )

    .grid.grid-cols-5
      //- Episodes.
      .col-span-2.contain-size
        .flex.h-full.flex-col.gap-3.overflow-y-scroll.p-3
          CustomTitle.rounded-xl.border.p-2(title="1. Episode selection")
            template(#extra)
              BookMarkedIcon(:size="20")

          ul.flex.flex-col.gap-2
            Episode.h-max.cursor-pointer.rounded-lg.border(
              v-for="episodeId in Object.keys(scenario.content.episodes)"
              :scenario
              :episode-id
              :selected="selectedEpisodeId === episodeId"
              @click.stop="selectedEpisodeId = episodeId"
              :class="{ 'border-primary-500': selectedEpisodeId === episodeId }"
            )

      //- Episode details.
      .col-span-3.flex.h-max.flex-col.gap-3.border-l.p-3
        CustomTitle.rounded-xl.border.p-2(title="2. Settings")
          template(#extra)
            Settings2Icon(:size="20")

        .flex.flex-col.gap-2
          img.aspect-video.rounded-lg.object-cover(
            v-if="selectedEpisodeImageUrl"
            :src="selectedEpisodeImageUrl"
          )

          .my-1.px-1
            CustomTitle(:title="'Episode: ' + selectedEpisode.name")
            p.leading-snug {{ selectedEpisode.about }}

          .grid.grid-cols-2.gap-2
            button._mode-button(
              @click="mode = Mode.Immersive"
              :class="{ _selected: mode === Mode.Immersive }"
              :disabled="!(scenario instanceof ImmersiveScenario)"
            )
              MonitorIcon(:size="28" :stroke-width="1.75")
              | Visual novel mode
            button._mode-button(
              @click="mode = Mode.Chat"
              :class="{ _selected: mode === Mode.Chat }"
            )
              MessagesSquareIcon(:size="28" :stroke-width="1.75")
              | Chat mode

          Alert(type="info")
            p(v-if="mode === Mode.Immersive") In visual novel mode you get visual and audio feedback, but it is slower and requires more compute. With the potential for quests and achievements, this is the future of gaming!
            p(v-else) In chat mode you get text and voice feedback only, but it is faster and requires less compute.

  .border-t.p-3
    button.btn.btn-pressable-sm.btn-primary.btn-md.w-full.rounded-lg(
      :disabled="!selectedEpisodeId"
      @click="play(selectedEpisodeId)"
    )
      | 3. Play!
</template>

<style lang="scss" scoped>
._mode-button {
  @apply btn btn-pressable-sm btn-neutral flex flex-col rounded-lg border p-3 font-semibold leading-tight;

  &._selected {
    @apply btn-primary;
  }
}
</style>

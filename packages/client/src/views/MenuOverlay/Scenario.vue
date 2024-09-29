<script setup lang="ts">
import EpisodeCard from "@/components/EpisodeCard.vue";
import ImmersiveModeIcon from "@/components/Icons/ImmersiveModeIcon.vue";
import NsfwIcon from "@/components/NsfwIcon.vue";
import RichTitle from "@/components/RichForm/RichTitle.vue";
import ScenarioCard from "@/components/ScenarioCard.vue";
import ScenarioDetails from "@/components/ScenarioDetails.vue";
import { d } from "@/lib/drizzle";
import { ImmersiveScenario } from "@/lib/simulation/scenario";
import * as tauri from "@/lib/tauri";
import { useScenarioQuery } from "@/queries";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  BookIcon,
  DramaIcon,
  FolderIcon,
  ScrollTextIcon,
  TrophyIcon,
} from "lucide-vue-next";
import { onMounted, shallowRef } from "vue";
import Achievement from "./Scenario/Achievement.vue";
import Character from "./Scenario/Character.vue";

const props = defineProps<{
  scenarioId: string;
}>();

defineEmits<{
  (event: "back"): void;
  (event: "newGame", episodeId?: string): void;
}>();

const { data: scenario } = useScenarioQuery(props.scenarioId);

const saves = shallowRef<Pick<typeof d.simulations.$inferSelect, "id">[]>([]);

async function showInFileManager() {
  if (!scenario.value) {
    console.warn("No scenario to show in file manager");
    return;
  }

  await tauri.utils.fileManagerOpen(scenario.value.basePath);
}

onMounted(async () => {
  saves.value = await d.db.query.simulations.findMany({
    columns: { id: true },
    orderBy: desc(d.simulations.updatedAt),
    where: and(
      eq(d.simulations.scenarioId, props.scenarioId),
      isNull(d.simulations.deletedAt),
    ),
  });
});
</script>

<template lang="pug">
.flex.flex-col
  RichTitle.border-b.p-3(:title="scenario?.content.name")
    template(#icon)
      BookIcon(:size="20")
    template(#extra)
      .flex.items-center.gap-1
        .cursor-help.rounded-lg.border.border-dashed.p-1.text-pink-500(
          v-if="scenario?.content.nsfw"
          v-tooltip="'This scenario is NSFW'"
        )
          NsfwIcon.text-pink-500(:size="18")
        .cursor-help.rounded-lg.border.border-dashed.p-1(
          v-if="scenario instanceof ImmersiveScenario && true"
          v-tooltip="'This scenario supports immersive mode'"
        )
          ImmersiveModeIcon(:size="18")
        button.btn-pressable.btn.btn-sm-square.rounded-lg.border(
          v-if="!scenario?.builtin"
          @click="showInFileManager"
          v-tooltip="'Show in file manager'"
        )
          FolderIcon(:size="18")

  ._main.grid.h-full.w-full(v-if="scenario")
    //- Content section.
    section._content.flex.h-full.w-full.flex-col.gap-2.p-3(
      style="grid-area: content"
      class="@container"
    )
      template(v-if="Object.keys(scenario.content.episodes).length > 1")
        //- Episodes.
        RichTitle(title="Episodes")
          template(#icon)
            ScrollTextIcon(:size="18")
          template(#extra)
            span {{ Object.keys(scenario.content.episodes).length }}

        //- Episodes grid.
        .grid.w-full.grid-cols-3.gap-2
          EpisodeCard.cursor-pointer.overflow-hidden.rounded-lg.border-4.border-white.bg-white.shadow-lg.transition-transform.pressable(
            v-for="[episodeId, episode] in Object.entries(scenario.content.episodes)"
            :key="episodeId"
            :scenario
            :episodeId
            :episode
            @click="$emit('newGame', episodeId)"
          )

      template(
        v-if="scenario.content.achievements && scenario.content.achievements.length"
      )
        //- Achievements.
        RichTitle(title="Achievements")
          template(#icon)
            TrophyIcon(:size="18")
          template(#extra)
            span {{ scenario.content.achievements.length }}

        //- Achievements grid.
        ul.grid.w-full.grid-cols-2.gap-2
          li(v-for="achievement of scenario.content.achievements")
            Achievement.h-24.rounded-lg.bg-white.shadow-lg(
              :scenario
              :achievement
            )

      //- Characters.
      RichTitle(title="Characters")
        template(#icon)
          DramaIcon(:size="18")
        template(#extra)
          span {{ Object.keys(scenario.content.characters).length }}

      //- Characters grid.
      .grid.gap-2(class="@sm:grid-cols-2")
        Character.overflow-hidden.rounded-lg.bg-white.shadow-lg(
          v-for="[characterId, character] in Object.entries(scenario.content.characters)"
          :key="characterId"
          :scenario
          :character-id
          :character
        )

    //- Side section.
    section._side.h-full.gap-3.border-r.p-3(style="grid-area: side")
      .flex.flex-col.gap-3(style="grid-area: scenario")
        ScenarioCard._scenario-card.h-full.shrink.cursor-pointer.rounded-lg.border-4.border-white.shadow-lg.transition-transform.pressable-sm(
          :scenario
          layout="grid"
          :narrow-padding="true"
          :always-hide-details="true"
          @click="$emit('back')"
        )

      .flex.flex-col.gap-3(style="grid-area: content")
        ScenarioDetails.gap-2.rounded-lg.bg-white.p-3.shadow-lg(
          :scenario
          :show-attributes="true"
        )

        button.btn-pressable.btn.btn-primary.btn-md.rounded-lg(
          @click="$emit('newGame')"
        )
          | Play now
</template>

<style lang="scss" scoped>
$breakpoint: 1280px; // xl

@media (max-width: #{$breakpoint - 1}) {
  ._main {
    grid-template-areas: "side" "content";
    @apply overflow-y-scroll;
  }

  ._side {
    @apply grid border-b;
    grid-template-areas: "scenario scenario content content content";
    @apply grid-cols-5;
  }
}

@media (min-width: $breakpoint) {
  ._main {
    grid-template-areas: "side content content content";
    @apply grid-cols-4;
  }

  ._side {
    @apply flex flex-col overflow-y-scroll;
  }
}
</style>

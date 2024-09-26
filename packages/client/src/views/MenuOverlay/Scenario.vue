<script setup lang="ts">
import CustomTitle from "@/components/CustomTitle.vue";
import NsfwIcon from "@/components/NsfwIcon.vue";
import { d } from "@/lib/drizzle";
import { ImmersiveScenario } from "@/lib/simulation/scenario";
import * as tauri from "@/lib/tauri";
import { prettyNumber } from "@/lib/utils";
import { useScenarioQuery } from "@/queries";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  BookMarkedIcon,
  DramaIcon,
  FolderIcon,
  Globe2Icon,
  ImageIcon,
  MonitorIcon,
  ProportionsIcon,
  TrophyIcon,
} from "lucide-vue-next";
import { onMounted, shallowRef } from "vue";
import ScenarioVue from "./Library/Scenario.vue";
import Achievement from "./Scenario/Achievement.vue";
import Character from "./Scenario/Character.vue";
import Episode from "./Scenario/Episode.vue";

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
._main.grid.h-full.w-full(v-if="scenario")
  //- Content section.
  section._content.flex.h-full.w-full.flex-col.gap-2.p-3(
    style="grid-area: content"
    class="@container"
  )
    template(v-if="Object.keys(scenario.content.episodes).length > 1")
      //- Episodes.
      CustomTitle(title="Episodes")
        template(#icon)
          BookMarkedIcon(:size="18")
        template(#extra)
          span {{ Object.keys(scenario.content.episodes).length }}

      //- Episodes grid.
      .grid.w-full.grid-cols-3.gap-2
        Episode.cursor-pointer.overflow-hidden.rounded-lg.bg-white.shadow-lg.transition-transform.pressable(
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
      CustomTitle(title="Achievements")
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
    CustomTitle(title="Characters")
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
      ScenarioVue._scenario-card.h-full.shrink.cursor-pointer.rounded-lg.border-4.border-white.shadow-lg.transition-transform.pressable-sm(
        :scenario
        layout="grid"
        :narrow-padding="true"
        :always-hide-details="true"
        @click="$emit('back')"
      )

    .flex.flex-col.gap-3(style="grid-area: content")
      .flex.flex-col.gap-2.rounded-lg.bg-white.p-3.shadow-lg
        CustomTitle(:title="scenario.content.name")
          template(#extra)
            .flex.gap-1
              NsfwIcon.cursor-help.text-pink-500(
                v-if="scenario.content.nsfw"
                :size="18"
                v-tooltip="'This scenario is NSFW'"
              )
              MonitorIcon.cursor-help(
                v-if="scenario instanceof ImmersiveScenario && true"
                :size="18"
                v-tooltip="'This scenario supports visual novel mode'"
              )
              button.btn.btn-pressable.rounded.border.shadow-lg(
                class="p-0.5"
                v-if="!scenario.builtin"
                @click="showInFileManager"
                v-tooltip="'Show in file manager'"
              )
                FolderIcon(:size="14" :stroke-width="2.5")

        p.col-span-2.text-sm.italic.leading-tight {{ scenario.content.about }}

        ul.flex.flex-wrap.gap-1
          li.rounded-lg.border.px-1.text-xs(
            v-for="tag of scenario.content.tags"
          ) \#{{ tag }}

        .flex.flex-wrap.gap-x-2.gap-y-1.text-sm
          .flex.items-center.gap-1
            Globe2Icon(:size="16")
            span.shrink-0.font-semibold Language:
            span {{ scenario.content.language }}

          .flex.cursor-help.items-center.gap-1.underline.decoration-dashed(
            title="Minimum context size for a Large Language Model"
          )
            ProportionsIcon(:size="16")
            span.shrink-0.font-semibold Context:
            span {{ prettyNumber(scenario.content.contextWindowSize, { space: false }) }}

          .flex.items-center.gap-1
            BookMarkedIcon(:size="16")
            span.shrink-0.font-semibold Episodes:
            span {{ Object.keys(scenario.content.episodes).length }}

          .flex.items-center.gap-1
            TrophyIcon(:size="16")
            span.shrink-0.font-semibold Achievements:
            span {{ scenario.content.achievements ? Object.keys(scenario.content.achievements).length : 0 }}

          .flex.items-center.gap-1
            DramaIcon(:size="16")
            span.shrink-0.font-semibold Characters:
            span {{ Object.keys(scenario.content.characters).length }}

          template(v-if="scenario instanceof ImmersiveScenario && true")
            .flex.items-center.gap-1
              ImageIcon(:size="16")
              span.shrink-0.font-semibold Scenes:
              span {{ Object.keys(scenario.content.scenes).length }}

      button.btn-pressable.btn.btn-primary.btn-md.rounded-lg(
        @click="$emit('newGame')"
      )
        | Play now
</template>

<style lang="scss" scoped>
$breakpoint: 1024px;

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

<script setup lang="ts">
import CustomTitle from "@/components/CustomTitle.vue";
import NsfwIcon from "@/components/NsfwIcon.vue";
import Placeholder from "@/components/Placeholder.vue";
import { type Scenario } from "@/lib/simulation";
import { ImmersiveScenario } from "@/lib/simulation/scenario";
import { asyncComputed } from "@vueuse/core";
import { CherryIcon, MonitorIcon } from "lucide-vue-next";

const props = defineProps<{
  scenario: Scenario;
  layout: "grid" | "list";
  narrowPadding?: boolean;
}>();

const thumbnailUrl = asyncComputed(() => props.scenario.getThumbnailUrl());
</script>

<template lang="pug">
//- Grid layout.
.group.relative.overflow-hidden(v-if="layout === 'grid'" class="aspect-[2/3]")
  img.h-full.w-full.select-none.object-cover.transition(
    class="hover:brightness-105"
    v-if="thumbnailUrl"
    :src="thumbnailUrl"
  )
  Placeholder.h-full.w-full(v-else)

  .absolute.bottom-0.left-0.z-10.flex.h-max.w-full.flex-col.justify-between.gap-1.bg-white(
    :class="{ 'p-3': !narrowPadding, 'px-2 py-3': narrowPadding }"
  )
    //- Top.
    .flex.flex-col
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
      p.text-sm.leading-snug {{ scenario.content.teaser }}

    //- Bottom.
    ul.flex.flex-wrap.gap-1
      li.rounded-lg.border.px-1.text-xs(v-for="tag of scenario.content.tags") \#{{ tag }}

//- List layout.
.group.flex(v-else)
  //- Thumbnail.
  .aspect-square.w-32.shrink-0.overflow-hidden
    img.h-full.w-full.select-none.object-cover.transition(
      class="group-hover:blur-none group-hover:brightness-105"
      v-if="thumbnailUrl"
      :src="thumbnailUrl"
    )
    Placeholder.h-full.w-full(v-else)

  //- Details.
  .flex.w-full.flex-col.justify-between.gap-1.p-2
    //- Top.
    .flex.flex-col
      CustomTitle(:title="scenario.content.name")
        template(#extra)
          .flex.gap-1
            CherryIcon.cursor-help.text-red-500(
              v-if="scenario.content.nsfw"
              :size="18"
              v-tooltip="'This scenario is NSFW'"
            )
            MonitorIcon.cursor-help(
              v-if="scenario instanceof ImmersiveScenario && true"
              :size="18"
              v-tooltip="'This scenario supports visual novel mode'"
            )
      p.text-sm.leading-snug {{ scenario.content.teaser }}

    //- Bottom.
    ul.flex.flex-wrap.gap-1
      li.rounded-lg.border.px-1.text-xs(v-for="tag of scenario.content.tags") \#{{ tag }}
</template>

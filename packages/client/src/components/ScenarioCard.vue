<script setup lang="ts">
import ImmersiveModeIcon from "@/components/Icons/ImmersiveModeIcon.vue";
import NsfwIcon from "@/components/NsfwIcon.vue";
import Placeholder from "@/components/Placeholder.vue";
import RichTitle from "@/components/RichForm/RichTitle.vue";
import { ImmersiveScenario, type Scenario } from "@/lib/scenario";
import { TransitionRoot } from "@headlessui/vue";
import { asyncComputed, useElementHover } from "@vueuse/core";
import { MonitorIcon } from "lucide-vue-next";
import { ref } from "vue";

const card = ref<HTMLElement | null>(null);
const isHovered = useElementHover(card);

const props = defineProps<{
  scenario: Scenario;
  layout: "grid" | "list";
  narrowPadding?: boolean;
  alwaysHideDetails?: boolean;
}>();

const thumbnailUrl = asyncComputed(() => props.scenario.getThumbnailUrl());
</script>

<template lang="pug">
//- Grid layout.
.group.relative.overflow-hidden(
  v-if="layout === 'grid'"
  ref="card"
  class="aspect-[3/4]"
)
  img.h-full.w-full.select-none.object-cover.transition(
    class="hover:brightness-105"
    v-if="thumbnailUrl"
    :src="thumbnailUrl"
  )
  Placeholder.h-full.w-full(v-else)

  //- Details.
  TransitionRoot.absolute.bottom-0.left-0.z-10.w-full(
    :show="!alwaysHideDetails && isHovered"
    enter="duration-200 ease-out"
    enter-from="translate-y-full opacity-0"
    enter-to="translate-y-0 opacity-100"
    leave="duration-100 ease-in"
    leave-from="translate-y-0 opacity-100"
    leave-to="translate-y-full opacity-0"
  )
    .flex.h-max.w-full.flex-col.justify-between.gap-1.bg-white(
      :class="{ 'p-3': !narrowPadding, 'px-2 py-3': narrowPadding }"
    )
      //- Top.
      .flex.flex-col
        RichTitle(:title="scenario.content.name")
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
.group.flex(v-else class="@container")
  //- Thumbnail.
  .hidden.aspect-square.w-32.overflow-hidden(class="@xs:block")
    img.h-full.w-full.select-none.object-cover.transition(
      class="group-hover:blur-none group-hover:brightness-105"
      v-if="thumbnailUrl"
      :src="thumbnailUrl"
    )
    Placeholder.h-full.w-full(v-else)

  //- Details.
  .flex.w-full.flex-col.justify-between.gap-1.p-3
    //- Top.
    .flex.flex-col
      RichTitle(:title="scenario.content.name")
        template(#extra)
          .flex.gap-1
            NsfwIcon.cursor-help.text-pink-500(
              v-if="scenario.content.nsfw"
              :size="18"
              v-tooltip="'This scenario is NSFW'"
            )
            ImmersiveModeIcon.cursor-help(
              v-if="scenario instanceof ImmersiveScenario && true"
              :size="18"
              v-tooltip="'This scenario supports immersive mode'"
            )
      p.text-sm.leading-snug {{ scenario.content.teaser }}

    //- Bottom.
    ul.flex.flex-wrap.gap-1
      li.rounded-lg.border.px-1.text-xs(v-for="tag of scenario.content.tags") \#{{ tag }}
</template>

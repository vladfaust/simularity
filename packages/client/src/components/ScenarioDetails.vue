<script setup lang="ts">
import { type Scenario } from "@/lib/scenario";
import { DramaIcon, ScrollTextIcon } from "lucide-vue-next";

defineProps<{
  scenario: Scenario;
  showAttributes?: boolean;
}>();
</script>

<template lang="pug">
.flex.flex-col
  p.col-span-2.text-sm.italic.leading-tight {{ scenario.about }}

  ul.flex.flex-wrap.gap-1
    li.rounded-lg.border.px-1.text-xs(v-for="tag of scenario.tags") \#{{ tag }}

  .flex.flex-wrap.gap-x-2.gap-y-1.text-sm(v-if="showAttributes")
    //- .flex.items-center.gap-1
    //-   Globe2Icon(:size="16")
    //-   span.shrink-0.font-semibold Language:
    //-   span {{ scenario.language }}

    //- .flex.cursor-help.items-center.gap-1.underline.decoration-dashed(
    //-   title="Minimum context size for a Large Language Model"
    //- )
    //-   ProportionsIcon(:size="16")
    //-   span.shrink-0.font-semibold Context:
    //-   span {{ prettyNumber(scenario.contextWindowSize, { space: false }) }}

    .flex.items-center.gap-1
      ScrollTextIcon(:size="16")
      span.shrink-0.font-semibold Episodes:
      span {{ Object.keys(scenario.episodes).length }}

    //- .flex.items-center.gap-1
    //-   TrophyIcon(:size="16")
    //-   span.shrink-0.font-semibold Achievements:
    //-   span {{ scenario.achievements ? Object.keys(scenario.achievements).length : 0 }}

    .flex.items-center.gap-1
      DramaIcon(:size="16")
      span.shrink-0.font-semibold Characters:
      span {{ Object.keys(scenario.characters).length }}

    //- template(v-if="scenario instanceof LocalImmersiveScenario && true")
    //-   .flex.items-center.gap-1
    //-     ImageIcon(:size="16")
    //-     span.shrink-0.font-semibold Scenes:
    //-     span {{ Object.keys(scenario.scenes).length }}

  .flex.text-xs
    span.italic.leading-tight Version: {{ scenario.version }}
</template>

<script setup lang="ts">
import RichTitle from "@/components/RichForm/RichTitle.vue";
import { type Scenario } from "@/lib/scenario";
import { v } from "@/lib/valibot";
import * as schema from "@simularity/api/lib/schema";
import { asyncComputed } from "@vueuse/core";
import { TrophyIcon } from "lucide-vue-next";

const { scenario, achievement } = defineProps<{
  scenario: Scenario;
  achievement: NonNullable<
    v.InferOutput<typeof schema.scenarios.BaseScenarioSchema>["achievements"]
  >[number];
  unlockDate?: Date;
}>();

const iconUrl = asyncComputed(() =>
  achievement.icon ? scenario.resourceUrl(achievement.icon.path) : null,
);
</script>

<template lang="pug">
.flex.w-full.overflow-hidden(
  :class="{ 'opacity-50 grayscale cursor-not-allowed': !unlockDate }"
)
  img.aspect-square.h-16.rounded-lg.object-cover(
    v-if="iconUrl"
    :src="iconUrl"
    alt="Achievement icon"
  )

  .flex.w-full.flex-col.justify-between.px-3.py-2
    .flex.flex-col
      RichTitle
        template(#extra)
          .flex.items-center.gap-1
            span.text-sm.font-medium {{ achievement.points }}
            TrophyIcon(:size="14" :stroke-width="2.5")
        span.text-sm.font-semibold.leading-snug.tracking-wide {{ achievement.title }}
      p.text-sm.leading-tight {{ achievement.description }}
    .flex(v-if="unlockDate")
      span.text-xs.text-gray-600 Unlocked {{ unlockDate.toLocaleDateString() }}
</template>

<script setup lang="ts">
import RichTitle from "@/components/RichForm/RichTitle.vue";
import { BaseScenarioSchema, type Scenario } from "@/lib/scenario";
import { v } from "@/lib/valibot";
import { asyncComputed } from "@vueuse/core";
import { TrophyIcon } from "lucide-vue-next";

const { scenario, achievement } = defineProps<{
  scenario: Scenario;
  achievement: NonNullable<
    v.InferOutput<typeof BaseScenarioSchema>["achievements"]
  >[number];
  unlockDate?: Date;
}>();

const iconUrl = asyncComputed(() =>
  achievement.iconPath ? scenario.resourceUrl(achievement.iconPath) : null,
);
</script>

<template lang="pug">
.flex.w-full.divide-x.overflow-hidden(
  :class="{ 'opacity-50 grayscale cursor-not-allowed': !unlockDate }"
)
  img.aspect-square.h-full.object-cover(
    v-if="iconUrl"
    :src="iconUrl"
    alt="Achievement icon"
  )

  .flex.w-full.flex-col.justify-between.p-2
    .flex.flex-col
      RichTitle(:title="achievement.title")
        template(#extra)
          .flex.items-center.gap-1
            span.text-sm {{ achievement.points }}
            TrophyIcon(:size="16")
      p.text-sm.leading-tight {{ achievement.description }}
    .flex(v-if="unlockDate")
      span.text-xs.text-gray-600 Unlocked {{ unlockDate.toLocaleDateString() }}
</template>

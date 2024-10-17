<script setup lang="ts">
import { CheckIcon, CornerRightDownIcon, XIcon } from "lucide-vue-next";

defineProps<{
  title: string;
  info: string;
  scenariosCount?: number;
  nsfwScenarios?: boolean;
  writerCloudModels?: string[];
  voicerCloudModels?: string[];
  priceMonthly?: number;
  experimentalFeatures?: boolean;
  voteForScenarios?: boolean;
  discordRole?: boolean;
}>();
</script>

<template lang="pug">
.flex.flex-col.divide-y
  .flex.items-center.justify-between.p-3
    span.text-xl.font-semibold {{ title }}
    .btn.aspect-square.shrink-0.rounded-lg.border.border-dashed.p-1(
      v-if="$slots.icon"
    )
      slot(name="icon")
  .p-3
    p.text-sm {{ info }}

  .flex.flex-col.gap-1.p-3(style="grid-template-columns: max-content auto")
    //- Total scenarios count.
    .flex.w-full.items-center.justify-between.gap-2
      .flex.shrink-0.items-center.gap-1.font-medium
        | Total scenarios
      .w-full.border-b
      .flex.items-center
        span {{ scenariosCount }}

    //- Discord role.
    .flex.w-full.items-center.justify-between.gap-2
      .flex.shrink-0.items-center.gap-1.font-medium
        | Discord role
      .w-full.border-b
      .flex.items-center
        CheckIcon.text-success-500(v-if="discordRole" :size="18")
        XIcon.text-error-500(v-else :size="18")

    //- Vote for scenarios.
    .flex.w-full.items-center.justify-between.gap-2
      .flex.shrink-0.items-center.gap-1.font-medium
        | Vote for next scenarios
      .w-full.border-b
      .flex.items-center
        CheckIcon.text-success-500(v-if="voteForScenarios" :size="18")
        XIcon.text-error-500(v-else :size="18")

    //- Access to experimental features.
    .flex.w-full.items-center.justify-between.gap-2
      .flex.shrink-0.items-center.gap-1.font-medium
        | Experimental features
      .w-full.border-b
      .flex.items-center
        CheckIcon.text-success-500(v-if="experimentalFeatures" :size="18")
        XIcon.text-error-500(v-else :size="18")

    //- Writer cloud models.
    .flex.w-full.items-center.justify-between.gap-2
      .flex.shrink-0.items-center.gap-1.font-medium
        | Cloud writer models
      .w-full.border-b
      .flex.items-center
        CornerRightDownIcon(v-if="writerCloudModels" :size="18")
        XIcon.text-error-500(v-else :size="18")
    .flex.flex-col.items-end(v-if="writerCloudModels?.length")
      span.text-sm(v-for="modelId in writerCloudModels") {{ modelId }}

    //- Voicer cloud models.
    .flex.w-full.items-center.justify-between.gap-2
      .flex.shrink-0.items-center.gap-1.font-medium
        | Cloud voicer models
      .w-full.border-b
      .flex.items-center
        CornerRightDownIcon(v-if="voicerCloudModels?.length" :size="18")
        XIcon.text-error-500(v-else :size="18")
    .flex.flex-col.items-end(v-if="voicerCloudModels?.length")
      span.text-sm(v-for="modelId in voicerCloudModels") {{ modelId }}

  .p-3
    slot(name="action")
</template>

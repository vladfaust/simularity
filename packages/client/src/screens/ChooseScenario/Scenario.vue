<script setup lang="ts">
import Placeholder from "@/components/Placeholder.vue";
import { Scenario } from "@/lib/simulation";
import { asyncComputed } from "@vueuse/core";

const props = defineProps<{
  scenario: Scenario;
}>();

const thumbnailUrl = asyncComputed(() => props.scenario.getThumbnailUrl());
</script>

<template lang="pug">
.flex.flex-col.divide-y
  img.aspect-square.w-full.select-none.object-cover(
    v-if="thumbnailUrl"
    :src="thumbnailUrl"
  )
  Placeholder.aspect-square.w-full(v-else)

  .flex.flex-col.gap-1.p-3
    span.select-none.font-semibold.leading-tight.tracking-wide {{ scenario.name }}
    p.select-none.text-sm.leading-tight {{ scenario.about }}
    span.select-none.font-mono.text-sm.leading-tight.opacity-50 /{{ scenario.id }}
</template>

<style lang="scss" scoped></style>

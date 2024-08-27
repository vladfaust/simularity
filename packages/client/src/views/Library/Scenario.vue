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
  img.w-full.select-none.object-cover.transition(
    class="aspect-[3/4] hover:scale-105 hover:brightness-105"
    v-if="thumbnailUrl"
    :src="thumbnailUrl"
  )
  Placeholder.w-full(v-else class="aspect-[3/4]")
</template>

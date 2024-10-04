<script setup lang="ts">
import { useScenarioQuery } from "@/queries";
import ScenarioCard from "./ScenarioCard.vue";

defineOptions({
  inheritAttrs: false,
});

const props = defineProps<{
  layout: "grid" | "list";
  narrowPadding?: boolean;
  alwaysHideDetails?: boolean;
  scenarioId: string;
}>();

const scenario = useScenarioQuery(props.scenarioId);
</script>

<template lang="pug">
ScenarioCard(
  v-if="scenario"
  v-bind="$attrs"
  :layout
  :narrow-padding
  :always-hide-details
  :scenario
)
div(v-else)
</template>

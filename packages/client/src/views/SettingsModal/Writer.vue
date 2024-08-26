<script setup lang="ts">
import { Simulation } from "@/lib/simulation";
import LlmAgentModel from "./LlmAgent/LlmAgentModel.vue";
import * as storage from "@/lib/storage";
import { InfoIcon } from "lucide-vue-next";

defineProps<{
  simulation: Simulation;
}>();

const driverConfig = defineModel<storage.llm.LlmDriverConfig | null>(
  "driverConfig",
);
</script>

<template lang="pug">
.flex.flex-col.gap-2.p-3
  .flex.gap-2.rounded-b-lg.rounded-tr-lg.border.p-2
    InfoIcon.shrink-0(:size="20")
    p.text-sm.leading-tight
      | Writer agent is responsible, among other tasks, for generating the story. Writer is
      |
      b required
      |
      | for the simulation to function. It has to be a capable model trained for roleplay. Bigger context size allows to go on with the story for longer without the need to consolidate.

  LlmAgentModel(
    agent-id="writer"
    :driver-instance="simulation.writer.llmDriver.value ?? undefined"
    v-model:driver-config="driverConfig"
  )
</template>

<style lang="scss" scoped></style>

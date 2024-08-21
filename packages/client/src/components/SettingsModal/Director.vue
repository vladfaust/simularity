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
    p.text-sm.leading-tight Director agent is responsible for generating scene updates as the story advances. It has to be a fine instruction-tuned model with good reasoning—to understand what's going on—, trained for JSON outputs.

  LlmAgentModel(
    agent-id="director"
    :driver-instance="simulation.director.llmDriver.value ?? undefined"
    v-model:driver-config="driverConfig"
  )
</template>

<style lang="scss" scoped></style>

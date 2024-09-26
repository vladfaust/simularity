<script setup lang="ts">
import Alert from "@/components/Alert.vue";
import { Simulation } from "@/lib/simulation";
import * as storage from "@/lib/storage";
import LlmAgentModel from "./LlmAgent/LlmAgentModel.vue";
import { SigmaSquareIcon } from "lucide-vue-next";

defineProps<{
  simulation?: Simulation;
}>();

const driverConfig = defineModel<storage.llm.LlmDriverConfig | null>(
  "driverConfig",
);
</script>

<template lang="pug">
.flex.flex-col.gap-2.p-3
  Alert(type="info")
    p.text-sm.leading-tight
      | Writer agent is responsible, among other tasks, for generating the story. Writer is
      |
      b required
      |
      | for the simulation to function. It has to be a capable model trained for roleplay. Bigger context size allows to go on with the story for longer without the need to consolidate.

  Alert(type="info")
    | Upon approaching the context size limit, press the consolidate button to free up the context.
    template(#icon)
      .btn.btn-shadow.aspect-square.h-max.rounded.border.bg-white.p-1.transition(
        class="hover:animate-pulse hover:text-ai-500"
      )
        SigmaSquareIcon(:size="18")

  LlmAgentModel(
    agent-id="writer"
    :driver-instance="simulation?.writer.llmDriver.value ?? undefined"
    v-model:driver-config="driverConfig"
    :recommended-context-size="simulation?.scenario.content.contextWindowSize"
  )
    template(#context-size-help="{ contextSize, maxContextSize }")
      Alert(type="warn" v-if="contextSize > maxContextSize")
        | Model is trained on up to {{ maxContextSize }} tokens. Consider reducing the context size to avoid performance degradation.
      Alert(
        type="warn"
        v-if="simulation && contextSize < simulation.scenario.content.contextWindowSize"
      )
        | Scenario requires at least {{ simulation.scenario.content.contextWindowSize }} tokens of context. Consider increasing the context size to avoid context overflow.
</template>

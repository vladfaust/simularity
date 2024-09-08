<script setup lang="ts">
import Alert from "@/components/Alert.vue";
import { Simulation } from "@/lib/simulation";
import * as storage from "@/lib/storage";
import LlmAgentModel from "./LlmAgent/LlmAgentModel.vue";

const CONTEXT_SIZE_MULTIPLIER = 1.25;

defineProps<{
  simulation: Simulation;
}>();

const driverConfig = defineModel<storage.llm.LlmDriverConfig | null>(
  "driverConfig",
);
</script>

<template lang="pug">
.flex.flex-col.gap-2.p-3
  Alert(type="info")
    | Director is an agent responsible for generating scene updates as the story advances.
    | It has to be a fine instruction-tuned model with good reasoning—to understand what's going on—, trained for JSON outputs.
    | Director is only required in visual novel mode.

  LlmAgentModel(
    agent-id="director"
    :driver-instance="simulation.director?.llmDriver.value ?? undefined"
    v-model:driver-config="driverConfig"
    :recommended-context-size="simulation.scenario.content.contextWindowSize * CONTEXT_SIZE_MULTIPLIER"
  )
    template(#context-size-help="{ contextSize, maxContextSize }")
      Alert(type="warn" v-if="contextSize > maxContextSize")
        | Model is trained on up to {{ maxContextSize }} tokens. Consider reducing the context size to avoid performance degradation.
      Alert(
        type="warn"
        v-if="contextSize < simulation.scenario.content.contextWindowSize"
      )
        | Scenario requires at least {{ simulation.scenario.content.contextWindowSize }} tokens of context. Consider increasing the context size to avoid context overflow.
      Alert(
        type="info"
        v-if="maxContextSize >= simulation.scenario.content.contextWindowSize * CONTEXT_SIZE_MULTIPLIER && contextSize < simulation.scenario.content.contextWindowSize * CONTEXT_SIZE_MULTIPLIER"
      )
        | Consider setting the context size to ~{{ CONTEXT_SIZE_MULTIPLIER }}x of writer's ({{ simulation.scenario.content.contextWindowSize * CONTEXT_SIZE_MULTIPLIER }}+).
</template>

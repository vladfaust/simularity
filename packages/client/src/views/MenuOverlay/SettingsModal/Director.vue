<script setup lang="ts">
import Alert from "@/components/Alert.vue";
import CustomTitle from "@/components/CustomTitle.vue";
import InteractiveHelper from "@/components/InteractiveHelper.vue";
import Toggle from "@/components/Toggle.vue";
import { env } from "@/env";
import { Simulation } from "@/lib/simulation";
import * as storage from "@/lib/storage";
import { directorTeacherMode } from "@/lib/storage/llm";
import { GraduationCapIcon, TreesIcon } from "lucide-vue-next";
import LlmAgentModel from "./LlmAgent/LlmAgentModel.vue";

const CONTEXT_SIZE_MULTIPLIER = 1.25;

defineProps<{
  simulation?: Simulation;
}>();

const driverConfig = defineModel<storage.llm.LlmDriverConfig | null>(
  "driverConfig",
);
</script>

<template lang="pug">
.flex.flex-col
  InteractiveHelper.border-b(:show-background="false")
    Alert.bg-white(type="info")
      | Director is an agent responsible for generating scene updates as the story advances.
      | It has to be a fine instruction-tuned model with good reasoning—to understand what's going on—, trained for JSON outputs.
      | Director is only required in visual novel mode.

  .flex.flex-col.gap-2.p-3
    CustomTitle(title="Ambience Volume")
      template(#icon)
        TreesIcon(:size="20")
      template(#extra)
        .flex.shrink-0.items-center.gap-2
          input(
            type="range"
            min="0"
            max="100"
            v-model="storage.ambientVolumeStorage.value"
          )
          .flex.w-14.items-center.justify-end.rounded-full.border.px-2.text-sm.font-medium {{ storage.ambientVolumeStorage.value }}%

    CustomTitle(v-if="env.VITE_EXPERIMENTAL_FEATURES" title="Teacher Mode")
      template(#icon)
        GraduationCapIcon(:size="20")
      template(#extra)
        Toggle#teacher-mode(v-model="directorTeacherMode" size="sm")

    Alert(v-if="env.VITE_EXPERIMENTAL_FEATURES" type="info")
      | In teacher mode, director generation is disabled; updates shall be created manually.

    LlmAgentModel(
      agent-id="director"
      :driver-instance="simulation?.director?.llmDriver.value ?? undefined"
      v-model:driver-config="driverConfig"
      :recommended-context-size="simulation ? simulation.scenario.content.contextWindowSize * CONTEXT_SIZE_MULTIPLIER : undefined"
      :class="{ 'opacity-50 pointer-events-none': env.VITE_EXPERIMENTAL_FEATURES && directorTeacherMode }"
    )
      template(#context-size-help="{ contextSize, maxContextSize }")
        Alert(type="warn" v-if="contextSize > maxContextSize")
          | Model is trained on up to {{ maxContextSize }} tokens. Consider reducing the context size to avoid performance degradation.
        Alert(
          type="warn"
          v-if="simulation && contextSize < simulation.scenario.content.contextWindowSize"
        )
          | Scenario requires at least {{ simulation.scenario.content.contextWindowSize }} tokens of context. Consider increasing the context size to avoid context overflow.
        Alert(
          type="info"
          v-if="simulation && maxContextSize >= simulation.scenario.content.contextWindowSize * CONTEXT_SIZE_MULTIPLIER && contextSize < simulation.scenario.content.contextWindowSize * CONTEXT_SIZE_MULTIPLIER"
        )
          | Consider setting the context size to ~{{ CONTEXT_SIZE_MULTIPLIER }}x of writer's ({{ simulation.scenario.content.contextWindowSize * CONTEXT_SIZE_MULTIPLIER }}+).
</template>

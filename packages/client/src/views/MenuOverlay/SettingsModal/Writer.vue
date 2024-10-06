<script setup lang="ts">
import Alert from "@/components/Alert.vue";
import InteractiveHelper from "@/components/InteractiveHelper.vue";
import RichInput from "@/components/RichForm/RichInput.vue";
import RichToggle from "@/components/RichForm/RichToggle.vue";
import { Simulation } from "@/lib/simulation";
import * as storage from "@/lib/storage";
import { MessageSquareTextIcon, Settings2Icon } from "lucide-vue-next";
import { ref } from "vue";
import LlmAgentModel from "./LlmAgent/LlmAgentModel.vue";

defineProps<{
  simulation?: Simulation;
}>();

const driverConfig = defineModel<storage.llm.LlmDriverConfig | null>(
  "driverConfig",
);

const selectedModel = ref<storage.llm.CachedModel | null>();
</script>

<template lang="pug">
.flex.flex-col
  InteractiveHelper.border-b(:show-background="false")
    Alert.bg-white(type="info")
      p.text-sm.leading-tight
        | Writer agent is responsible, among other tasks, for generating the story. Writer is
        |
        b required
        |
        | for the simulation to function. It has to be a capable model trained for roleplay. Bigger context size allows to go on with the story for longer without the need to consolidate.

  .flex.flex-col.gap-2.p-3
    .flex.flex-col.gap-2.rounded-lg.bg-white.p-3.shadow-lg
      //- Show update IDs.
      RichToggle#auto-enabled(
        title="Show update IDs"
        v-model="storage.showUpdateIds.value"
      )
        template(#icon)
          Settings2Icon(:size="16")

      RichInput#n-eval(title="Message length limit")
        template(#icon)
          MessageSquareTextIcon(:size="16")
        input.rounded-lg.border.px-2.py-1.text-sm(
          type="number"
          min="32"
          max="512"
          v-model="storage.llm.writerNEval.value"
        )

    LlmAgentModel(
      agent-id="writer"
      :driver-instance="simulation?.writer.llmDriver.value ?? undefined"
      :has-cache="true"
      v-model:driver-config="driverConfig"
      v-model:selected-model="selectedModel"
      :recommended-context-size="simulation?.scenario.content.contextWindowSize"
    )
      template(#context-size-help="{ contextSize, maxContextSize }")
        //- Trained context size alert.
        Alert.bg-white(type="warn" v-if="contextSize > maxContextSize")
          | Model is trained on up to {{ maxContextSize }} tokens. Consider reducing the context size to avoid performance degradation.

        //- Scenario context size alert.
        Alert.bg-white(
          type="warn"
          v-if="simulation && contextSize < simulation.scenario.content.contextWindowSize"
        )
          | Scenario requires at least {{ simulation.scenario.content.contextWindowSize }} tokens of context. Consider increasing the context size to avoid context overflow.
</template>

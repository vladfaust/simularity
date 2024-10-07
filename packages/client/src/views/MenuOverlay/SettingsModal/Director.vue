<script setup lang="ts">
import Alert from "@/components/Alert.vue";
import InteractiveHelper from "@/components/InteractiveHelper.vue";
import RichRange from "@/components/RichForm/RichRange.vue";
import RichToggle from "@/components/RichForm/RichToggle.vue";
import { Simulation } from "@/lib/simulation";
import * as storage from "@/lib/storage";
import { directorTeacherMode } from "@/lib/storage/llm";
import {
  ClapperboardIcon,
  GraduationCapIcon,
  TreesIcon,
} from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import LlmAgentModel from "./LlmAgent/LlmAgentModel.vue";

const CONTEXT_SIZE_MULTIPLIER = 1.25;

defineProps<{
  simulation?: Simulation;
}>();

const driverConfig = defineModel<storage.llm.LlmDriverConfig | null>(
  "driverConfig",
);

const { t } = useI18n({
  messages: {
    "en-US": {
      settings: {
        director: {
          directorHelp:
            "Director is an agent responsible for generating scene updates as the story advances. It has to be a fine instruction-tuned model with good reasoning—to understand what's going on—, trained for JSON outputs. Director is only required in visual novel mode.",
          ambienceVolume: "Ambience Volume",
          teacherMode: "Teacher Mode",
          directorModel: "Director Model",
          contextSizeAlert:
            "Model is trained on up to {maxContextSize} tokens. Consider reducing the context size to avoid performance degradation.",
          scenarioContextSizeAlert:
            "Scenario requires at least {contextSize} tokens of context. Consider increasing the context size to avoid context overflow.",
          contextSizeHelp:
            "Consider setting the context size to ~{CONTEXT_SIZE_MULTIPLIER}x of writer's ({simulation.scenario.content.contextWindowSize * CONTEXT_SIZE_MULTIPLIER}+).",
        },
      },
    },
  },
});
</script>

<template lang="pug">
.flex.flex-col
  InteractiveHelper.border-b(:show-background="false")
    Alert.bg-white(type="info")
      | {{ t("settings.director.directorHelp") }}

  .flex.flex-col.gap-2.p-3
    .flex.flex-col.gap-2.rounded-lg.bg-white.p-3.shadow-lg
      RichRange#ambience-volume(
        :title="t('settings.director.ambienceVolume')"
        v-model="storage.ambientVolumeStorage.value"
        :percent="true"
      )
        template(#icon)
          TreesIcon(:size="16")

      RichToggle#teacher-mode(
        :title="t('settings.director.teacherMode')"
        v-model="directorTeacherMode"
      )
        template(#icon)
          GraduationCapIcon(:size="16")

    LlmAgentModel(
      agent-id="director"
      :driver-instance="simulation?.director?.llmDriver.value ?? undefined"
      :has-cache="true"
      v-model:driver-config="driverConfig"
      :recommended-context-size="simulation ? simulation.scenario.content.contextWindowSize * CONTEXT_SIZE_MULTIPLIER : undefined"
      :class="{ 'opacity-50 pointer-events-none': directorTeacherMode }"
    )
      template(#title)
        .flex.shrink-0.items-center(class="gap-1.5")
          .btn.rounded-lg.border.bg-white.p-1
            ClapperboardIcon(:size="18")
          h2.shrink-0.font-semibold.leading-tight.tracking-wide {{ t("settings.director.directorModel") }}

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

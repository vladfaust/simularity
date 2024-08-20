<script setup lang="ts">
import { ClapperboardIcon, FeatherIcon, SpeechIcon } from "lucide-vue-next";
import AgentStatusVue, { Status } from "./ProgressBar/AgentStatus.vue";
import { Simulation } from "@/lib/simulation";
import { computed } from "vue";
import type { BaseLlmDriver } from "@/lib/ai/llm/BaseLlmDriver";
import { LlmStatus } from "@/lib/ai/llm/BaseLlmDriver";
import type { LlmAgentId } from "@/lib/storage/llm";
import { unreachable } from "@/lib/utils";

const AGENT_ICON_SIZE = 20;

const { simulation } = defineProps<{
  simulation: Simulation;
}>();

function llmDriverDone(agent: LlmAgentId): boolean | undefined {
  switch (agent) {
    case "writer":
      return simulation.writerDone.value;
    case "director":
      return simulation.directorDone.value;
    default:
      throw unreachable(agent);
  }
}

function llmStatus(agent: LlmAgentId, llmDriver: BaseLlmDriver | null): Status {
  if (!llmDriver) {
    return Status.Disabled;
  } else if (llmDriver.busy.value) {
    return Status.Busy;
  } else if (llmDriverDone(agent)) {
    return Status.Done;
  } else {
    return Status.Waiting;
  }
}

// TODO: Differentiate decoding, inferring.
function llmStatusText(llmDriver: BaseLlmDriver | null): string | undefined {
  if (!llmDriver) {
    return;
  } else if (llmDriver.busy.value) {
    let text = "";

    switch (llmDriver.status.value) {
      case LlmStatus.Decoding:
        text = "Decoding";
        break;
      case LlmStatus.Inferring:
        text = "Inferring";
        break;
    }

    if (llmDriver.progress.value) {
      const percentage = Math.round((llmDriver.progress.value * 100) / 100);
      text += ` (${percentage}%)`;
    }

    return text;
  }
}

const writerStatus = computed<Status>(() =>
  llmStatus("writer", simulation.writer.llmDriver.value),
);

const writerStatusText = computed<string | undefined>(() =>
  llmStatusText(simulation.writer.llmDriver.value),
);

const directorStatus = computed<Status>(() =>
  llmStatus("director", simulation.director.llmDriver.value),
);

const directorStatusText = computed<string | undefined>(() =>
  llmStatusText(simulation.director.llmDriver.value),
);
</script>

<template lang="pug">
.flex.items-center.justify-center.gap-2.bg-white.px-2
  //- Writer status.
  AgentStatusVue(
    key="writer"
    :status="writerStatus"
    :status-text="writerStatusText"
  )
    template(#agentIcon)
      FeatherIcon(:size="AGENT_ICON_SIZE")

  //- Director status.
  AgentStatusVue(
    key="director"
    :status="directorStatus"
    :status-text="directorStatusText"
  )
    template(#agentIcon)
      ClapperboardIcon(:size="AGENT_ICON_SIZE")

  //- TTS status.
  AgentStatusVue(key="tts" :status="Status.Disabled")
    template(#agentIcon)
      SpeechIcon(:size="AGENT_ICON_SIZE")
</template>

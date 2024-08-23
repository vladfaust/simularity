<script setup lang="ts">
import type { BaseLlmDriver } from "@/lib/ai/llm/BaseLlmDriver";
import { LlmStatus } from "@/lib/ai/llm/BaseLlmDriver";
import { Simulation } from "@/lib/simulation";
import { VoicerJobStatus } from "@/lib/simulation/agents/voicer/job";
import * as storage from "@/lib/storage";
import type { LlmAgentId } from "@/lib/storage/llm";
import { unreachable } from "@/lib/utils";
import { AudioLinesIcon, ClapperboardIcon, FeatherIcon } from "lucide-vue-next";
import { computed } from "vue";
import AgentStatusVue, { Status } from "./ProgressBar/AgentStatus.vue";

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

const voicerStatus = computed<Status>(() => {
  if (
    !storage.tts.ttsConfig.value?.enabled ||
    !simulation.voicer.ttsDriver.value
  ) {
    // Voicer is disabled.
    return Status.Disabled;
  } else if (simulation.voicerJob.value === undefined) {
    // Waiting for the next job.
    return Status.Waiting;
  } else if (simulation.voicerJob.value === null) {
    // Current job is skipped, i.e. character voiceover is disabled.
    return Status.Disabled;
  } else {
    switch (simulation.voicerJob.value.status.value) {
      case VoicerJobStatus.FetchingSpeaker:
      case VoicerJobStatus.Queued:
        return Status.Queued;
      case VoicerJobStatus.Inferring:
        return Status.Busy;
      case VoicerJobStatus.Error:
        return Status.Error;
      case VoicerJobStatus.Succees:
        return Status.Done;
      default:
        throw unreachable(simulation.voicerJob.value.status.value);
    }
  }
});

const voicerStatusText = computed<string | undefined>(() => {
  if (
    !storage.tts.ttsConfig.value?.enabled ||
    !simulation.voicer.ttsDriver.value
  ) {
    // Voicer is disabled.
    return;
  } else if (simulation.voicerJob.value === undefined) {
    // Waiting for the next job.
    return;
  } else if (simulation.voicerJob.value === null) {
    // Current job is skipped, i.e. character voiceover is disabled.
    return;
  } else
    switch (simulation.voicerJob.value.status.value) {
      case VoicerJobStatus.Queued:
      case VoicerJobStatus.FetchingSpeaker:
        return "Queued";
      case VoicerJobStatus.Inferring: {
        let text = "Inferring";

        if (simulation.voicerJob.value.progress.value !== undefined) {
          const percentage = Math.round(
            (simulation.voicerJob.value.progress.value * 100) / 100,
          );
          text += ` (${percentage}%)`;
        }

        return text;
      }
      case VoicerJobStatus.Error:
        return "Error";
      case VoicerJobStatus.Succees:
        return;
      default:
        throw unreachable(simulation.voicerJob.value.status.value);
    }
});
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
  AgentStatusVue(
    key="tts"
    :status="voicerStatus"
    :status-text="voicerStatusText"
  )
    template(#agentIcon)
      AudioLinesIcon(:size="AGENT_ICON_SIZE")
</template>

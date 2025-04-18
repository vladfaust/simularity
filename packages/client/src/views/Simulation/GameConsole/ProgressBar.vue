<script setup lang="ts">
import { env } from "@/env";
import type { BaseLlmDriver } from "@/lib/ai/llm/BaseLlmDriver";
import { LlmStatus } from "@/lib/ai/llm/BaseLlmDriver";
import { VoicerJobStatus } from "@/lib/simulation/agents/voicer/job";
import { PredictUpdateVariantJob } from "@/lib/simulation/jobs/predictUpdateVariant";
import * as storage from "@/lib/storage";
import type { LlmAgentId } from "@/lib/storage/llm";
import { clamp, unreachable } from "@/lib/utils";
import { AudioLinesIcon, FeatherIcon } from "lucide-vue-next";
import { computed } from "vue";
import AgentStatusVue, { Status } from "./ProgressBar/AgentStatus.vue";

const AGENT_ICON_SIZE = 20;

const { job } = defineProps<{
  job: PredictUpdateVariantJob | null;
}>();

function llmDriverDone(agent: LlmAgentId): boolean | undefined {
  switch (agent) {
    case "writer":
      return job?.writerDone.value;
    default:
      throw unreachable(agent);
  }
}

function llmStatus(agent: LlmAgentId, llmDriver: BaseLlmDriver | null): Status {
  if (!llmDriver || llmDriverDone(agent) === undefined) {
    return Status.Disabled;
  } else if (llmDriver.busy.value) {
    return Status.Busy;
  } else if (llmDriverDone(agent)) {
    return Status.Done;
  } else {
    return Status.Waiting;
  }
}

function llmStatusText(llmDriver: BaseLlmDriver | null): string | undefined {
  if (!llmDriver) {
    return;
  } else if (llmDriver.busy.value) {
    let text = "";

    switch (llmDriver.status.value) {
      case LlmStatus.Queued:
        text = "Queued";
        break;
      case LlmStatus.Initializing:
        text = "Initializing";
        break;
      case LlmStatus.Decoding:
        text = "Decoding";
        break;
      case LlmStatus.Inferring:
        text = "Inferring";
        break;
    }

    if (llmDriver.progress.value) {
      const percentage = Math.round(
        clamp(llmDriver.progress.value, 0, 1) * 100,
      );
      text += ` (${percentage}%)`;
    }

    return text;
  }
}

const writerStatus = computed<Status>(() =>
  llmStatus("writer", job?.agents.writer.llmDriver.value ?? null),
);

const writerStatusText = computed<string | undefined>(() =>
  llmStatusText(job?.agents.writer.llmDriver.value ?? null),
);

const voicerStatus = computed<Status>(() => {
  if (!storage.tts.ttsEnabled.value || !job?.agents.voicer.ttsDriver.value) {
    // Voicer is disabled.
    return Status.Disabled;
  } else if (job.voicerJob.value === undefined) {
    // Waiting for the next job.
    return Status.Waiting;
  } else if (job.voicerJob.value === null) {
    // Current job is skipped, i.e. character voiceover is disabled.
    return Status.Disabled;
  } else {
    switch (job.voicerJob.value.status.value) {
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
        throw unreachable(job.voicerJob.value.status.value);
    }
  }
});

const voicerStatusText = computed<string | undefined>(() => {
  if (!storage.tts.ttsEnabled.value || !job?.agents.voicer.ttsDriver.value) {
    // Voicer is disabled.
    return;
  } else if (job.voicerJob.value === undefined) {
    // Waiting for the next job.
    return;
  } else if (job.voicerJob.value === null) {
    // Current job is skipped, i.e. character voiceover is disabled.
    return;
  } else
    switch (job.voicerJob.value.status.value) {
      case VoicerJobStatus.Queued:
      case VoicerJobStatus.FetchingSpeaker:
        return "Queued";
      case VoicerJobStatus.Inferring: {
        let text = "Inferring";

        if (job.voicerJob.value.progress.value !== undefined) {
          const percentage = Math.round(
            clamp(job.voicerJob.value.progress.value, 0, 1) * 100,
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
        throw unreachable(job.voicerJob.value.status.value);
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

  //- TTS status.
  AgentStatusVue(
    v-if="env.VITE_EXPERIMENTAL_VOICER"
    key="tts"
    :status="voicerStatus"
    :status-text="voicerStatusText"
  )
    template(#agentIcon)
      AudioLinesIcon(:size="AGENT_ICON_SIZE")
</template>

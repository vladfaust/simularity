<script setup lang="ts">
import { type BaseLlmDriver } from "@/lib/ai/llm/BaseLlmDriver";
import * as storage from "@/lib/storage";
import { ActivityIcon, CloudIcon, CpuIcon, LogsIcon } from "lucide-vue-next";
import { ref } from "vue";
import LocalSettings from "./LlmAgentModel/Local.vue";
import RemoteSettings from "./LlmAgentModel/Remote.vue";
import GptStatus from "./Status.vue";

defineProps<{
  agentId: storage.llm.LlmAgentId;
  driverInstance: BaseLlmDriver | undefined;
}>();

const driverConfig = defineModel<storage.llm.LlmDriverConfig | null>(
  "driverConfig",
);

const driverType = ref<storage.llm.LlmDriverConfig["type"]>(
  driverConfig.value?.type ?? "remote",
);
</script>

<template lang="pug">
.flex.flex-col.gap-2
  .flex.flex-col
    .flex.w-full.items-center.justify-between
      h2.font-semibold.leading-tight.tracking-wide Model
      .ml-2.h-0.w-full.border-t

      //- Driver tabs.
      .grid.shrink-0.grid-cols-2.gap-1.overflow-hidden.rounded-t-lg.border-x.border-t.p-2
        button.btn.btn-sm.w-full.rounded.transition-transform.pressable(
          :class="{ 'btn-primary': driverType === 'local', 'btn-neutral': driverType !== 'local' }"
          @click="driverType = 'local'"
        )
          CpuIcon(:size="18")
          span Local
        button.btn.btn-sm.rounded.transition-transform.pressable(
          :class="{ 'btn-primary': driverType === 'remote', 'btn-neutral': driverType !== 'remote' }"
          @click="driverType = 'remote'"
        )
          CloudIcon(:size="18")
          span Cloud

    //- Driver content.
    .flex.w-full.flex-col.gap-2.overflow-hidden.rounded-b-lg.rounded-l-lg.border
      //- Local driver.
      LocalSettings(
        v-if="driverType === 'local'"
        :agent-id
        v-model:driver-config="driverConfig"
      )
        template(#context-size-help="{ contextSize, maxContextSize }")
          slot(
            name="context-size-help"
            :context-size="contextSize"
            :max-context-size="maxContextSize"
          )

      //- Remote driver.
      RemoteSettings(
        v-else-if="driverType === 'remote'"
        :agent-id
        v-model:driver-config="driverConfig"
      )

  //- Status.
  .flex.gap-1(v-if="driverInstance")
    .flex.w-full.w-full.items-center.justify-center.gap-1.rounded.bg-neutral-100.p-2
      ActivityIcon(:size="20")
      GptStatus(:driver="driverInstance")
    button.btn-neutral.btn-sm.btn.btn-pressable.rounded(
      disabled
      title="Logs (not implemented yet)"
    )
      LogsIcon(:size="20")
</template>

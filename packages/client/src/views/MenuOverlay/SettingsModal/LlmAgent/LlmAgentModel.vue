<script setup lang="ts">
import { type BaseLlmDriver } from "@/lib/ai/llm/BaseLlmDriver";
import * as storage from "@/lib/storage";
import { CloudIcon, CpuIcon } from "lucide-vue-next";
import { ref } from "vue";
import LocalSettings from "./LlmAgentModel/Local.vue";
import RemoteSettings from "./LlmAgentModel/Remote.vue";

defineProps<{
  agentId: storage.llm.LlmAgentId;
  driverInstance: BaseLlmDriver | undefined;
  recommendedContextSize?: number;
}>();

const driverConfig = defineModel<storage.llm.LlmDriverConfig | null>(
  "driverConfig",
);

const selectedModel = defineModel<storage.llm.CachedModel | null>(
  "selectedModel",
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
        button.btn.btn-sm.w-full.rounded.border.transition-transform.pressable(
          :class="{ 'btn-primary': driverType === 'local', 'bg-white': driverType !== 'local' }"
          @click="driverType = 'local'"
        )
          CpuIcon(:size="18")
          span Local
        button.btn.btn-sm.rounded.border.transition-transform.pressable(
          :class="{ 'btn-primary': driverType === 'remote', 'bg-white': driverType !== 'remote' }"
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
        :recommended-context-size
        v-model:driver-config="driverConfig"
        v-model:selected-model="selectedModel"
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
</template>

<script setup lang="ts">
import * as settings from "@/settings";
import { watch } from "vue";
import { ref } from "vue";
import * as dialog from "@tauri-apps/api/dialog";
import * as simularityLocal from "@/lib/simularity/local";
import { onMounted } from "vue";
import { unreachable } from "@/lib/utils";
import {
  ActivityIcon,
  FolderIcon,
  FolderOpenIcon,
  GlobeIcon,
  HardDriveIcon,
  InfoIcon,
  LogsIcon,
} from "lucide-vue-next";
import prettyBytes from "pretty-bytes";
import GptStatus from "./Agent/GptStatus.vue";
import { Gpt } from "@/lib/simularity/gpt";

const props = defineProps<{
  agentId: settings.AgentId;
  name: string;
  gpt: Gpt | undefined;
}>();

const driver = ref<settings.AgentDriver | undefined>();
watch(driver, async (newDriver) => {
  if (!newDriver) return;
  const setDriver = await settings.getAgentDriver(props.agentId);
  if (setDriver === newDriver) return;
  await settings.setAgentDriver(props.agentId, newDriver);
  await settings.save();
});

const localModelPath = ref<string | null>(null);
const localModelParams = ref<{
  size: number;
  nParams: number;
  nCtxTrain: number;
} | null>(null);
const remoteModel = ref<string | null>(null);

async function openLocalModelSelectionDialog() {
  const modelPath = await dialog.open({
    filters: [{ extensions: ["gguf"], name: "GGUF" }],
    multiple: false,
    title: "Select a local model file",
  });

  if (typeof modelPath === "string") {
    localModelPath.value = modelPath;
    const model = await simularityLocal.gpt.loadModel(modelPath);

    localModelPath.value = modelPath;
    localModelParams.value = model;
    console.log(model);

    await settings.setAgentLocalModelPath(props.agentId, modelPath);
    await settings.save();
  }
}

onMounted(async () => {
  const setDriver = await settings.getAgentDriver(props.agentId);

  switch (setDriver) {
    case "local": {
      driver.value = "local";

      localModelPath.value = await settings.getAgentLocalModelPath(
        props.agentId,
      );

      if (localModelPath.value) {
        const model = await simularityLocal.gpt.loadModel(localModelPath.value);
        localModelParams.value = model;
        console.debug({ model });
        const modelHash = await simularityLocal.gpt.modelHash(model.modelId);
        console.log({ modelHash: modelHash.xx64Hash });
      }

      break;
    }

    case "remote":
    case null:
      driver.value = "remote";
      remoteModel.value = await settings.getAgentRemoteModel(props.agentId);
      break;

    default:
      throw unreachable(setDriver);
  }
});
</script>

<template lang="pug">
.flex.flex-col
  .flex.w-full.items-center.justify-between
    h2.font-semibold.leading-tight.tracking-wide {{ name }}
    .ml-2.h-0.w-full.border-t

    //- Driver tabs.
    .grid.shrink-0.grid-cols-2.gap-1.overflow-hidden.rounded-t-lg.border-x.border-t.p-2
      button.btn.btn-sm.w-full.rounded.transition-transform.pressable(
        :class="{ 'btn-primary': driver === 'local', 'btn-neutral': driver !== 'local' }"
        @click="driver = 'local'"
      )
        HardDriveIcon(:size="20")
        span Local
      button.btn.btn-sm.rounded.transition-transform.pressable(
        :class="{ 'btn-primary': driver === 'remote', 'btn-neutral': driver !== 'remote' }"
        @click="driver = 'remote'"
      )
        GlobeIcon(:size="20")
        span Remote

  //- Driver content.
  .flex.w-full.flex-col.gap-2.rounded-b-lg.rounded-l-lg.border.p-2
    //- Remote driver.
    .grid.w-full.gap-2(
      v-if="driver === 'remote'"
      style="grid-template-columns: max-content auto"
    )
      span Can select model here

    //- Local driver.
    .flex.flex-col.gap-2(v-else-if="driver === 'local'")
      //- Model path.
      .flex.gap-2
        .flex.items-center.gap-1
          FolderIcon(:size="20")
          span.whitespace-nowrap.font-medium.tracking-wide Path
        .flex.w-full.items-center.overflow-x-hidden.rounded.border
          span.w-full.overflow-x-scroll.whitespace-nowrap.px-2.font-mono.text-sm {{ localModelPath || "No path selected" }}
          button.btn.btn-sm.border-l.transition-transform.pressable(
            @click="openLocalModelSelectionDialog"
          )
            FolderOpenIcon(:size="20")
            span ...

      //- Model params.
      .flex.w-full.flex-wrap.items-center.justify-between.gap-x-2.gap-y-1
        .flex.items-center.gap-1
          InfoIcon(:size="20")
          span.font-medium.leading-tight.tracking-wide Params:
          span.font-mono.leading-tight {{ localModelParams ? prettyBytes(localModelParams.nParams, { space: false }).slice(0, -1) : "Unknown" }}

        .flex.items-start.gap-1
          InfoIcon(:size="20")
          span.font-medium.leading-tight.tracking-wide Size:
          span.font-mono.leading-tight {{ localModelParams ? prettyBytes(localModelParams.size, { space: false }) : "Unknown" }}

        .flex.items-center.gap-1
          InfoIcon(:size="20")
          span.font-medium.leading-tight.tracking-wide Context size:
          span.font-mono.leading-tight {{ localModelParams ? localModelParams.nCtxTrain : "Unknown" }}

      //- Status.
      .flex.gap-1(v-if="gpt")
        .flex.w-full.w-full.items-center.justify-center.gap-1.rounded.bg-neutral-100.p-2
          ActivityIcon(:size="20")
          GptStatus(:gpt="gpt")
        button.btn-neutral.btn-sm.btn.btn-pressable.rounded(
          disabled
          title="Logs (not implemented yet)"
        )
          LogsIcon(:size="20")
</template>

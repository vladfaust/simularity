<script setup lang="ts">
import * as settings from "@/settings";
import { watch } from "vue";
import { ref } from "vue";
import * as dialog from "@tauri-apps/api/dialog";
import * as simularityLocal from "@/lib/simularity/local";
import { onMounted } from "vue";
import { unreachable } from "@/lib/utils";
import { FolderOpenIcon, GlobeIcon, HardDriveIcon } from "lucide-vue-next";

const props = defineProps<{
  agentId: settings.AgentId;
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
//- Driver tabs.
.grid.grid-cols-2.overflow-hidden.rounded-lg.border.p-1
  button.btn.btn-md.rounded.transition-transform.pressable(
    :class="{ 'btn-primary': driver === 'remote' }"
    @click="driver = 'remote'"
  )
    GlobeIcon(:size="20")
    span Remote
  button.btn.btn-md.w-full.rounded.transition-transform.pressable(
    :class="{ 'btn-primary': driver === 'local' }"
    @click="driver = 'local'"
  )
    HardDriveIcon(:size="20")
    span Local

//- Remote driver.
.grid.w-full.gap-2(
  v-if="driver === 'remote'"
  style="grid-template-columns: max-content auto"
)
  span Can select model here

//- Local driver.
.grid.w-full.gap-2(
  v-else-if="driver === 'local'"
  style="grid-template-columns: max-content auto"
)
  .flex.items-center
    span.whitespace-nowrap.font-semibold Model path
  .flex.w-full.items-center.overflow-x-hidden.rounded-lg.border.p-1
    span.w-full.overflow-x-scroll.whitespace-nowrap.px-2 {{ localModelPath || "No path selected" }}
    button.btn.btn-sm.rounded-lg.border.transition-transform.pressable(
      @click="openLocalModelSelectionDialog"
    )
      FolderOpenIcon(:size="20")
      span ...

  .flex.items-center
    span.whitespace-nowrap.font-semibold Size
  .flex.items-center
    span {{ localModelParams ? localModelParams.size : "Unknown" }}

  .flex.items-center
    span.whitespace-nowrap.font-semibold Params
  .flex.items-center
    span {{ localModelParams ? localModelParams.nParams : "Unknown" }}

  .flex.items-center
    span.whitespace-nowrap.font-semibold Context size
  .flex.items-center
    span {{ localModelParams ? localModelParams.nCtxTrain : "Unknown" }}
</template>

<style lang="scss" scoped></style>

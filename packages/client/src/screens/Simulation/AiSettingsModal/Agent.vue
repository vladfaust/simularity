<script setup lang="ts">
import { ref } from "vue";
import * as dialog from "@tauri-apps/api/dialog";
import * as fsExtra from "tauri-plugin-fs-extra-api";
import * as tauri from "@/lib/tauri";
import * as api from "@/lib/api";
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
import { getCachedLlm, setCachedLlm, type CachedLlm } from "@/store";
import * as store from "@/store";
import { toSeconds } from "duration-fns";
import { type BaseLlmDriver } from "@/lib/inference/BaseLlmDriver";
import { watchImmediate } from "@vueuse/core";
import { onMounted } from "vue";

type LlmAgentId = "writer" | "director";

const apiBaseUrl = ref(import.meta.env.VITE_DEFAULT_API_BASE_URL);
const jwt = ref(import.meta.env.VITE_API_JWT);

const props = defineProps<{
  agentId: LlmAgentId;
  name: string;
  driverInstance: BaseLlmDriver | undefined;
}>();

const driverType = ref<store.LlmDriverConfig["type"]>(
  store.writerDriverConfig.value?.type ?? "tauri",
);

const localModelPath = ref<string | null>(null);
const localModelParams = ref<{
  size: number;
  nParams: number;
  nCtxTrain: number;
} | null>(null);
const remoteModelId = ref<string | null>(null);

const latestLocalModelPath =
  props.agentId === "writer"
    ? store.latestWriterLocalModelPath
    : store.latestDirectorLocalModelPath;

const latestRemoteModelId =
  props.agentId === "writer"
    ? store.latestWriterRemoteModelId
    : store.latestDirectorRemoteModelId;

const driverConfigStorage =
  props.agentId === "writer"
    ? store.writerDriverConfig
    : store.directorDriverConfig;

async function findOrCreateLocalCachedLlm(
  modelPath: string,
): Promise<CachedLlm> {
  let cachedLlm = getCachedLlm(modelPath);
  let meta: fsExtra.Metadata;

  if (cachedLlm) {
    meta = await fsExtra.metadata(modelPath);

    if (
      cachedLlm.modifiedAt !==
      toSeconds({ milliseconds: meta.modifiedAt.getTime() })
    ) {
      console.log("Model has been modified, updating cache");
      cachedLlm = null;
    }
  }

  if (!cachedLlm) {
    console.debug("Model not found in cache, loading model");
    const loadedModel = await tauri.gpt.loadModel(modelPath);
    console.debug("Model loaded", loadedModel);
    const { xx64Hash: modelHash } =
      await tauri.gpt.getModelHashByPath(modelPath);
    console.debug("Model hash", modelHash);
    meta ||= await fsExtra.metadata(modelPath);

    cachedLlm = {
      path: modelPath,
      contextSize: loadedModel.nCtxTrain,
      modelHash,
      nParams: loadedModel.nParams,
      ramSize: loadedModel.size,
      modifiedAt: toSeconds({ milliseconds: meta.modifiedAt.getTime() }),
    };
    setCachedLlm(modelPath, cachedLlm);
  }

  return cachedLlm;
}

async function setTauriDriverConfig(modelPath: string) {
  let cachedLlm = await findOrCreateLocalCachedLlm(modelPath);

  driverConfigStorage.value = {
    type: "tauri",
    modelPath,
    contextSize: cachedLlm.contextSize,
  };

  localModelParams.value = {
    size: cachedLlm.ramSize,
    nParams: cachedLlm.nParams,
    nCtxTrain: cachedLlm.contextSize,
  };
}

async function setRemoteDriverConfig(modelId: string | null) {
  if (modelId) {
    driverConfigStorage.value = {
      type: "remote",
      modelId,
      baseUrl: apiBaseUrl.value,
      jwt: jwt.value,
    };
  } else {
    driverConfigStorage.value = null;
  }
}

async function openLocalModelSelectionDialog() {
  const modelPath = await dialog.open({
    filters: [{ extensions: ["gguf"], name: "GGUF" }],
    multiple: false,
    title: "Select a local model file",
  });

  if (typeof modelPath === "string") {
    latestLocalModelPath.value = modelPath;
    localModelPath.value = modelPath;
    await setTauriDriverConfig(modelPath);
  }
}

watchImmediate(driverType, async (newType) => {
  if (!newType) return;
  switch (newType) {
    case "tauri": {
      localModelPath.value = latestLocalModelPath.value;
      remoteModelId.value = null;

      if (localModelPath.value) {
        await setTauriDriverConfig(localModelPath.value);
      }

      break;
    }

    case "remote": {
      remoteModelId.value = latestRemoteModelId.value;
      localModelPath.value = null;
      localModelParams.value = null;

      if (remoteModelId.value) {
        setRemoteDriverConfig(remoteModelId.value);
      }

      break;
    }
  }
});

const remoteModels = ref<
  Awaited<ReturnType<typeof api.v1.models.index>> | undefined
>();

onMounted(() => {
  api.v1.users.get(apiBaseUrl.value, jwt.value).then((res) => {
    console.log(res);
  });

  api.v1.models.index(apiBaseUrl.value, jwt.value).then((res) => {
    remoteModels.value = res;
  });
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
        :class="{ 'btn-primary': driverType === 'tauri', 'btn-neutral': driverType !== 'tauri' }"
        @click="driverType = 'tauri'"
      )
        HardDriveIcon(:size="20")
        span Local
      button.btn.btn-sm.rounded.transition-transform.pressable(
        :class="{ 'btn-primary': driverType === 'remote', 'btn-neutral': driverType !== 'remote' }"
        @click="driverType = 'remote'"
      )
        GlobeIcon(:size="20")
        span Remote

  //- Driver content.
  .flex.w-full.flex-col.gap-2.rounded-b-lg.rounded-l-lg.border.p-2
    //- Remote driver.
    .flex.w-full.flex-col.gap-2(
      v-if="driverType === 'remote'"
      style="grid-template-columns: max-content auto"
    )
      .flex.justify-between
        span Model
        select.select.select-sm.w-max(
          v-model="remoteModelId"
          @change="setRemoteDriverConfig(remoteModelId)"
        )
          option(value="" disabled) Select a model
          option(
            v-for="model in remoteModels"
            :key="model.id"
            :value="model.id"
          ) {{ model.name }}

    //- Local driver.
    .flex.flex-col.gap-2(v-else-if="driverType === 'tauri'")
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

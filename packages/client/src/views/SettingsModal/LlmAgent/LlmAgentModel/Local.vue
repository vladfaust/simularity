<script setup lang="ts">
import * as storage from "@/lib/storage";
import * as tauri from "@/lib/tauri";
import { omit } from "@/lib/utils";
import * as dialog from "@tauri-apps/api/dialog";
import * as fs from "@tauri-apps/api/fs";
import * as path from "@tauri-apps/api/path";
import { asyncComputed } from "@vueuse/core";
import {
  CloudDownloadIcon,
  FileIcon,
  FolderOpenIcon,
  ProportionsIcon,
} from "lucide-vue-next";
import * as fsExtra from "tauri-plugin-fs-extra-api";
import { computed, onMounted, ref, shallowRef, triggerRef } from "vue";
import Model from "./Local/Model.vue";

const props = defineProps<{
  agentId: storage.llm.LlmAgentId;
  recommendedContextSize?: number;
}>();
const driverConfig = defineModel<storage.llm.LlmDriverConfig | null>(
  "driverConfig",
);
const customModelsStorage = storage.llm.useCustomModels(props.agentId);
const cachedModels = shallowRef<storage.llm.CachedModel[]>([]);
const uncachedModels = ref<string[]>([]);
const selectedModelPath = ref<string | null>(
  driverConfig.value?.type === "local" ? driverConfig.value.modelPath : null,
);
const selectedModel = computed(() =>
  selectedModelPath.value
    ? cachedModels.value.find(
        (cachedModel) => cachedModel.path === selectedModelPath.value,
      )
    : undefined,
);
const latestLocalModelConfig = storage.llm.useLatestLocalModelConfig(
  props.agentId,
);

async function cacheModel(modelPath: string, metadata?: fsExtra.Metadata) {
  console.log(`Caching model ${modelPath}`);

  const loadedModel = await tauri.gpt.loadModel(modelPath);
  console.debug("Model loaded", loadedModel);

  const { xx64Hash: modelHash } = await tauri.gpt.getModelHashByPath(modelPath);
  console.debug("Model hash", modelHash);

  metadata ||= await fsExtra.metadata(modelPath);

  const cachedModel: storage.llm.CachedModel = {
    path: modelPath,
    contextSize: loadedModel.nCtxTrain,
    modelHash,
    nParams: loadedModel.nParams,
    ramSize: loadedModel.size,
    modifiedAt: metadata.modifiedAt.getTime(),
  };

  storage.llm.setCachedModel(modelPath, cachedModel);
  console.log(`Cached model ${modelPath}`, omit(cachedModel, ["path"]));

  return cachedModel;
}

function setDriverConfig(cachedModelIndex: number) {
  const cachedModel = cachedModels.value.at(cachedModelIndex);

  if (!cachedModel) {
    throw new Error(`Cached model not found at index ${cachedModelIndex}`);
  }

  const contextSize = Math.min(
    cachedModel.contextSize,
    props.recommendedContextSize ?? cachedModel.contextSize,
  );

  driverConfig.value = {
    type: "local",
    modelPath: cachedModel.path,
    contextSize,
  };

  console.log("Temp driver config set", props.agentId, {
    modelPath: cachedModel.path,
  });
}

function selectModel(cachedModelIndex: number) {
  const cachedModel = cachedModels.value.at(cachedModelIndex);

  if (!cachedModel) {
    throw new Error(`Cached model not found at index ${cachedModelIndex}`);
  }

  if (selectedModelPath.value !== cachedModel.path) {
    selectedModelPath.value = cachedModel.path;
    setDriverConfig(cachedModelIndex);
  }
}

async function openLocalModelSelectionDialog() {
  const modelPath = await dialog.open({
    filters: [{ extensions: ["gguf"], name: "GGUF" }],
    multiple: false,
    title: "Select a local model file",
  });

  if (typeof modelPath === "string") {
    // Check if the model is already added.
    if (
      customModelsStorage.value.includes(modelPath) ||
      cachedModels.value.some(
        (cachedModel) => cachedModel.path === modelPath,
      ) ||
      uncachedModels.value.includes(modelPath)
    ) {
      console.log(`Model ${modelPath} is already in the storage`);
      return;
    }

    uncachedModels.value.push(modelPath);

    try {
      const cachedModel = await cacheModel(modelPath);
      cachedModels.value.push(cachedModel);
      customModelsStorage.value.push(modelPath);
      triggerRef(cachedModels);
      if (!selectedModelPath.value) {
        selectedModelPath.value = modelPath;
        selectModel(cachedModels.value.length - 1);
      }
    } catch (e: any) {
      console.error(`Failed to cache model ${modelPath}`, e);
    } finally {
      uncachedModels.value.pop();
    }
  }
}

async function modelsDirectory() {
  const baseDir = await tauri.resolveBaseDir(fs.BaseDirectory.AppLocalData);
  return await path.join(baseDir, "models", props.agentId);
}

const modelsDirectoryRef = asyncComputed(modelsDirectory);

async function openModelsDirectory() {
  await tauri.utils.fileManagerOpen(await modelsDirectory());
}

/**
 * If model is in the models directory, its file is deleted.
 * Otherwise, the model entry is removed from the storage.
 */
async function removeModel(modelPath: string) {
  if (modelPath.startsWith(modelsDirectoryRef.value)) {
    console.log(`Deleting model file ${modelPath}`);
    await fs.removeFile(modelPath);
    cachedModels.value = cachedModels.value.filter(
      (cachedModel) => cachedModel.path !== modelPath,
    );
  } else {
    console.log(`Removing model entry ${modelPath} from storage`);

    customModelsStorage.value = customModelsStorage.value.filter(
      (customModel) => customModel !== modelPath,
    );

    cachedModels.value = cachedModels.value.filter(
      (cachedModel) => cachedModel.path !== modelPath,
    );
  }
}

onMounted(async () => {
  const modelsDir = await modelsDirectory();
  console.log(`Checking for models in ${modelsDir}`);

  await fs.createDir(modelsDir, {
    dir: fs.BaseDirectory.AppLocalData,
    recursive: true,
  });

  const entries = await fs.readDir(modelsDir, {
    dir: fs.BaseDirectory.AppLocalData,
  });

  // Remove custom models that no longer exist.
  const customModelEntries = await Promise.all(
    customModelsStorage.value.map(async (modelPath) => {
      if (await fs.exists(modelPath)) {
        return {
          path: modelPath,
          name: await path.basename(modelPath),
        };
      }

      console.warn(`Custom model ${modelPath} not found, removing`);

      return null;
    }),
  );

  // Remove the missing custom models from the storage.
  for (let i = customModelEntries.length - 1; i >= 0; i--) {
    if (!customModelEntries[i]) {
      customModelsStorage.value.splice(i, 1);
    }
  }

  // Add existing custom models to the entries list.
  entries.push(...customModelEntries.filter((entry) => entry !== null));

  for (const entry of entries) {
    if (!entry.name) {
      console.warn("Entry has no name, skipping");
      continue;
    }

    if (entry.children) {
      console.log(`${entry.name} is a directory, skipping`);
      continue;
    }

    let cachedModel = storage.llm.getCachedModel(entry.path);
    const metadata = await fsExtra.metadata(entry.path);

    if (cachedModel) {
      if (metadata.modifiedAt.getTime() !== cachedModel.modifiedAt) {
        console.log(`Cached model ${entry.path} is outdated`);
        cachedModel = null;
      }
    }

    if (!cachedModel) {
      uncachedModels.value.push(entry.path);

      try {
        cachedModel = await cacheModel(entry.path, metadata);
      } catch (e: any) {
        console.error(`Failed to cache model ${entry.path}`, e);
        continue;
      } finally {
        uncachedModels.value.pop();
      }
    }

    cachedModels.value.push(cachedModel);
    triggerRef(cachedModels);
  }

  if (driverConfig.value?.type !== "local") {
    if (latestLocalModelConfig.value) {
      const modelPath = latestLocalModelConfig.value.modelPath;
      const cachedModelIndex = cachedModels.value.findIndex(
        (cachedModel) => cachedModel.path === modelPath,
      );

      if (cachedModelIndex === -1) {
        console.warn(
          `Cached model not found for latest local model config ${modelPath} (probably removed)`,
        );
      }

      setDriverConfig(cachedModelIndex);
      selectedModelPath.value = latestLocalModelConfig.value.modelPath;
    }
  }
});
</script>

<template lang="pug">
.flex.flex-col.divide-y
  .flex.justify-between.gap-1.p-2
    .flex.items-center.gap-1
      button.btn-pressable.btn-neutral.btn.btn-sm.rounded(
        disabled
        title="Download models from the cloud"
      )
        CloudDownloadIcon(:size="18")
        span Download...

      button.btn-pressable.btn-neutral.btn.btn-sm.rounded(
        @click="openLocalModelSelectionDialog"
        title="Add a local model from file"
      )
        FileIcon(:size="18")
        span Add from file

    button.btn-pressable.btn-neutral.btn.btn-sm.rounded(
      @click="openModelsDirectory"
      title="Open the models directory"
    )
      FolderOpenIcon(:size="18")
      span Open directory

  .grid.gap-2.bg-gray-50.p-2.shadow-inner
    template(v-if="cachedModels.length || uncachedModels.length")
      Model.rounded-lg.border.bg-white(
        v-for="(cachedModel, index) in cachedModels"
        :class="{ 'border-primary-500': selectedModelPath === cachedModel.path }"
        :key="cachedModel.path"
        :model="cachedModel"
        :selected="selectedModelPath === cachedModel.path"
        :remove-deletes-file="cachedModel.path.startsWith(modelsDirectoryRef)"
        @select="selectModel(index)"
        @remove="removeModel(cachedModel.path)"
      )
      Model.rounded-lg.border.bg-white(
        v-for="modelPath in uncachedModels"
        :key="modelPath"
        :model="{ path: modelPath }"
        :selected="false"
        :remove-deletes-file="modelPath.startsWith(modelsDirectoryRef)"
        @remove="removeModel(modelPath)"
      )
    p.col-span-full.flex.justify-center.p-1.text-sm.italic.opacity-50(v-else)
      | No models found. Add
      |
      span.font-mono .gguf
      |
      | &nbsp;models manually.

  .flex.flex-col.gap-2.p-2(
    v-if="driverConfig?.type === 'local' && selectedModel"
  )
    .flex.items-center.justify-between
      .flex.shrink-0.items-center.gap-1
        ProportionsIcon(:size="18" :stroke-width="2.5")
        span.font-medium Context size
      .ml-2.w-full.border-b
      input.input.input-md.shrink-0.rounded.border.px-2.py-1.text-sm(
        type="number"
        v-model="driverConfig.contextSize"
        :max="selectedModel.contextSize"
      )
    slot(
      name="context-size-help"
      :context-size="driverConfig.contextSize"
      :max-context-size="selectedModel.contextSize"
    )
</template>

<script setup lang="ts">
import * as storage from "@/lib/storage";
import * as tauri from "@/lib/tauri";
import { omit } from "@/lib/utils";
import * as dialog from "@tauri-apps/api/dialog";
import * as fs from "@tauri-apps/api/fs";
import * as path from "@tauri-apps/api/path";
import { FolderOpenIcon, ProportionsIcon } from "lucide-vue-next";
import * as fsExtra from "tauri-plugin-fs-extra-api";
import { computed, onMounted, ref, shallowRef, triggerRef } from "vue";
import Model from "./Local/Model.vue";

// TODO: Hashing takes some time, consider displaying a temp model div.

const props = defineProps<{ agentId: storage.llm.LlmAgentId }>();
const driverConfig = defineModel<storage.llm.LlmDriverConfig | null>(
  "driverConfig",
);
const customModels = storage.llm.useCustomModels(props.agentId);
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

  driverConfig.value = {
    type: "local",
    modelPath: cachedModel.path,
    contextSize: cachedModel.contextSize,
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
    uncachedModels.value.push(modelPath);

    try {
      const cachedModel = await cacheModel(modelPath);
      cachedModels.value.push(cachedModel);
      setDriverConfig(cachedModels.value.length - 1);
      customModels.value.push(modelPath);
      triggerRef(cachedModels);
      if (!selectedModelPath.value) {
        selectedModelPath.value = modelPath;
      }
    } catch (e: any) {
      console.error(`Failed to cache model ${modelPath}`, e);
    } finally {
      uncachedModels.value.pop();
    }
  }
}

onMounted(async () => {
  const baseDir = await tauri.resolveBaseDir(fs.BaseDirectory.AppLocalData);
  const modelsDir = await path.join("models", props.agentId);
  console.log(`Checking for models in ${await path.join(baseDir, modelsDir)}`);

  await fs.createDir(modelsDir, {
    dir: fs.BaseDirectory.AppLocalData,
    recursive: true,
  });

  const entries = await fs.readDir(modelsDir, {
    dir: fs.BaseDirectory.AppLocalData,
  });

  // Remove custom models that no longer exist.
  const customModelEntries = (
    await Promise.all(
      customModels.value.map(async (modelPath) => {
        if (await fs.exists(modelPath)) {
          return {
            path: modelPath,
            name: await path.basename(modelPath),
          };
        }

        // FIXME: Actually remove the custom model from the list.
        console.warn(`Custom model ${modelPath} not found, removing`);

        return null;
      }),
    )
  ).filter((modelPath) => modelPath !== null);

  entries.push(...customModelEntries);

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
.flex.flex-col.gap-2
  .flex
    button.btn-pressable.btn-neutral.btn.btn-md.rounded(
      @click="openLocalModelSelectionDialog"
    )
      FolderOpenIcon(:size="20")
      | Add from file...
  .grid.grid-cols-2.gap-2
    Model.rounded-lg.border(
      v-for="(cachedModel, index) in cachedModels"
      :class="{ 'border-primary-500': selectedModelPath === cachedModel.path }"
      :key="cachedModel.path"
      :model="cachedModel"
      :selected="selectedModelPath === cachedModel.path"
      @select="selectModel(index)"
    )
    Model.rounded-lg.border(
      v-for="modelPath in uncachedModels"
      :key="modelPath"
      :model="{ path: modelPath }"
      :selected="false"
    )

  .flex.flex-col(v-if="driverConfig?.type === 'local' && selectedModel")
    .flex.items-center.justify-between.gap-2
      .flex.shrink-0.items-center.gap-1
        ProportionsIcon(:size="18" :stroke-width="2.5")
        span.font-medium Context size
      .w-full.border-b
      input.input.input-md.shrink-0.rounded.border.px-2(
        type="number"
        v-model="driverConfig.contextSize"
        :max="selectedModel.contextSize"
      )
</template>

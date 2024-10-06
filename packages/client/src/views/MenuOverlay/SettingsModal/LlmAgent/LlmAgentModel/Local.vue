<script setup lang="ts">
import NumberInputWithDefault from "@/components/RichForm/NumberInputWithDefault.vue";
import RichInput from "@/components/RichForm/RichInput.vue";
import type { Download } from "@/lib/downloads";
import { downloadManager } from "@/lib/downloads";
import * as resources from "@/lib/resources";
import * as storage from "@/lib/storage";
import * as tauri from "@/lib/tauri";
import { omit } from "@/lib/utils";
import { broom } from "@lucide/lab";
import * as dialog from "@tauri-apps/api/dialog";
import * as fs from "@tauri-apps/api/fs";
import * as path from "@tauri-apps/api/path";
import { asyncComputed } from "@vueuse/core";
import {
  DatabaseZapIcon,
  FileIcon,
  FolderOpenIcon,
  Icon,
  RefreshCwIcon,
  Settings2Icon,
} from "lucide-vue-next";
import prettyBytes from "pretty-bytes";
import * as fsExtra from "tauri-plugin-fs-extra-api";
import type { ShallowRef } from "vue";
import { computed, onMounted, ref, shallowRef, triggerRef, watch } from "vue";
import WellKnownModel, {
  type AvailableModel,
  type WellKnownModelProps,
} from "./Local/WellKnownModel.vue";

const props = defineProps<{
  agentId: storage.llm.LlmAgentId;
  recommendedContextSize?: number;
  advanced?: boolean;
  hasCache?: boolean;
}>();

const driverConfig = defineModel<storage.llm.LlmDriverConfig | null>(
  "driverConfig",
);
const selectedModel = defineModel<storage.llm.CachedModel | null>(
  "selectedModel",
);

const customModelsStorage = storage.llm.useCustomModels(props.agentId);
const cachedModels = shallowRef<storage.llm.CachedModel[]>([]);
const uncachedModels = ref<string[]>([]);

const selectedModelPath = ref<string | null>(
  driverConfig.value?.type === "local" ? driverConfig.value.modelPath : null,
);

const cacheFiles = shallowRef<{ path: string; size: number }[]>([]);

watch(
  [selectedModelPath, cachedModels],
  ([selectedModelPath, cachedModels]) => {
    if (selectedModelPath) {
      selectedModel.value = cachedModels.find(
        (cachedModel) => cachedModel.path === selectedModelPath,
      );
    } else {
      selectedModel.value = null;
    }
  },
  { deep: true },
);

const latestLocalModelConfig = storage.llm.useLatestLocalModelConfig(
  props.agentId,
);

const availableModels = asyncComputed<Record<string, AvailableModel>>(() =>
  fetch(`/available_models/${props.agentId}.json`).then((res) => res.json()),
);

const allModels = asyncComputed<
  | {
      custom: storage.llm.CachedModel[];
      wellKnown: WellKnownModelProps[];
    }
  | undefined
>(async () => {
  if (!availableModels.value) return;

  const custom: storage.llm.CachedModel[] = [];
  const wellKnown: WellKnownModelProps[] = [];

  for (const cachedModel of cachedModels.value) {
    let found = false;

    loop: for (const [availableModelId, availableModel] of Object.entries(
      availableModels.value,
    )) {
      for (const [quantId, quant] of Object.entries(availableModel.quants)) {
        if (cachedModel.modelHash.sha256 !== quant.hash.sha256) continue;

        let existingRecommended = wellKnown.find(
          (recommendedModel) =>
            // TODO: Use ID instead of name.
            recommendedModel.recommendationModel.name === availableModel.name,
        );

        if (!existingRecommended) {
          existingRecommended = {
            recommendationModelId: availableModelId,
            recommendationModel: availableModel,
            cachedModelsByQuants: {},
            downloadsByQuant: shallowRef({}),
          };

          wellKnown.push(existingRecommended);
        }

        existingRecommended.cachedModelsByQuants[quantId] = {
          model: cachedModel,
          selected: computed(
            () => selectedModelPath.value === cachedModel.path,
          ),
          removeDeletesFile: cachedModel.path.startsWith(
            modelsDirectoryRef.value,
          ),
        };

        found = true;
        break loop;
      }
    }

    if (!found) {
      custom.push(cachedModel);
    }
  }

  // Iterate through available models to create new
  // well-known models, and set downloads.
  for (const [availableModelId, availableModel] of Object.entries(
    availableModels.value,
  )) {
    const downloadsByQuant: Record<string, ShallowRef<Download>> = {};

    for (const quantId of Object.keys(availableModel.quants)) {
      const download = downloadManager.downloads.get(
        await path.join(
          await modelsDirectory(),
          `${availableModelId}.${quantId}.download`,
        ),
      );

      if (download) {
        download.onComplete(() => refresh());
        downloadsByQuant[quantId] = shallowRef(download);
      }
    }

    let existingWellknown = wellKnown.find(
      (wk) =>
        // TODO: Use ID instead of name.
        wk.recommendationModel.name === availableModel.name,
    );

    if (!existingWellknown) {
      existingWellknown = {
        recommendationModelId: availableModelId,
        recommendationModel: availableModel,
        cachedModelsByQuants: {}, // Empty.
        downloadsByQuant: shallowRef(downloadsByQuant),
      };

      wellKnown.push(existingWellknown);
    } else {
      existingWellknown.downloadsByQuant = shallowRef(downloadsByQuant);
    }
  }

  return { custom, wellKnown };
});

async function refresh() {
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

    // Only process `.gguf` files.
    if (!entry.name.endsWith(".gguf")) {
      console.log(`${entry.name} is not a GGUF file, skipping`);
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
      triggerRef(uncachedModels);

      try {
        cachedModel = await cacheModel(entry.path, metadata);
      } catch (e: any) {
        console.error(`Failed to cache model ${entry.path}`, e);
        continue;
      } finally {
        uncachedModels.value.pop();
        triggerRef(uncachedModels);
      }
    }

    cachedModels.value.push(cachedModel);
    triggerRef(cachedModels);
  }
  {
    // Check cache dir (`appCacheDir/${agentId}`).
    const cacheDir = await path.join(
      await tauri.resolveBaseDir(fs.BaseDirectory.AppCache),
      props.agentId,
    );

    // Create the cache dir if it doesn't exist.
    await fs.createDir(cacheDir, { recursive: true });

    const entries = await fs.readDir(cacheDir);

    for (const entry of entries) {
      console.log("Cache entry", entry);
      if (!entry.name) {
        console.warn("Entry has no name, skipping");
        continue;
      }

      // Only process `.llama-state` files.
      if (!entry.name.endsWith(".llama-state")) {
        console.log(`${entry.name} is not a .llama-state file, skipping`);
        continue;
      }

      if (entry.children) {
        console.log(`${entry.name} is a directory, skipping`);
        continue;
      }

      cacheFiles.value.push({
        path: entry.path,
        size: (await fsExtra.metadata(entry.path)).size,
      });
    }

    console.log("State cache files", cacheFiles.value);
    triggerRef(cacheFiles);
  }
}

async function clearStateCache() {
  if (!cacheFiles.value.length) {
    return;
  }

  const cacheDir = await path.join(
    await tauri.resolveBaseDir(fs.BaseDirectory.AppCache),
    props.agentId,
  );

  const entries = await fs.readDir(cacheDir);

  for (const entry of entries) {
    console.log("Removing cache entry", entry);
    await fs.removeFile(entry.path);
  }

  cacheFiles.value = [];
}

async function cacheModel(modelPath: string, metadata?: fsExtra.Metadata) {
  console.log(`Caching model ${modelPath}`);

  const loadedModel = await tauri.gpt.loadModel(modelPath);
  console.debug("Model loaded", loadedModel);

  const xx64HashPromise = tauri.gpt.getModelHashByPath(modelPath);
  const sha256HashPromise = tauri.utils.fileSha256(modelPath, true);

  metadata ||= await fsExtra.metadata(modelPath);

  const cachedModel: storage.llm.CachedModel = {
    path: modelPath,
    contextSize: loadedModel.nCtxTrain,
    batchSize: 0,
    modelHash: {
      xx64: (await xx64HashPromise).xx64Hash,
      sha256: await sha256HashPromise,
    },
    nParams: loadedModel.nParams,
    ramSize: loadedModel.size,
    modifiedAt: metadata.modifiedAt.getTime(),
  };

  storage.llm.setCachedModel(modelPath, cachedModel);
  console.log(`Cached model ${modelPath}`, omit(cachedModel, ["path"]));

  return cachedModel;
}

function setDriverConfig(cachedModel: storage.llm.CachedModel) {
  const contextSize = Math.min(
    cachedModel.contextSize,
    props.recommendedContextSize ?? cachedModel.contextSize,
  );

  driverConfig.value = {
    type: "local",
    modelPath: cachedModel.path,
    contextSize,
    batchSize: cachedModel.batchSize,
  };

  console.log("Temp driver config set", props.agentId, {
    modelPath: cachedModel.path,
  });
}

function selectModel(cachedModel: storage.llm.CachedModel) {
  if (selectedModelPath.value !== cachedModel.path) {
    selectedModelPath.value = cachedModel.path;
    setDriverConfig(cachedModel);
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
        selectModel(cachedModel);
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
async function removeModel(modelPath: string, deleteFile: boolean) {
  if (
    !(await resources.confirm_(
      deleteFile
        ? "Are you sure you want to remove this model? The model file will be deleted."
        : "Are you sure you want to remove this model from the list?",
      {
        title: deleteFile ? "Delete model file?" : "Remove model?",
        okLabel: deleteFile ? "Delete" : "Remove",
        type: "warning",
      },
    ))
  ) {
    console.log("Cancelled delete", modelPath);
    return;
  }

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

  if (selectedModelPath.value === modelPath) {
    selectedModelPath.value = null;
    driverConfig.value = null;
  }
}

onMounted(async () => {
  await refresh();

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

      setDriverConfig(cachedModels.value[cachedModelIndex]);
      selectedModelPath.value = latestLocalModelConfig.value.modelPath;
    }
  }
});
</script>

<template lang="pug">
.flex.flex-col.divide-y(v-if="modelsDirectoryRef")
  //- Actions header.
  .flex.col-span-full.gap-2.items-center.p-3
    button.shrink-0.btn-pressable.bg-white.btn.btn-sm.rounded-lg.border(
      @click="openLocalModelSelectionDialog"
      title="Add a local model from file"
    )
      FileIcon(:size="18")
      span Add from file

    button.shrink-0.btn-pressable.bg-white.btn.btn-sm.rounded-lg.border(
      @click="openModelsDirectory"
      title="Open the models directory"
    )
      FolderOpenIcon(:size="18")
      span Open directory

    .w-full.border-b

    button.group.shrink-0.btn.btn-pressable.bg-white.btn-sm.rounded-lg.border(
      @click="refresh"
      title="Refresh"
    )
      RefreshCwIcon.transition(:size="18")
      span Refresh

  //- Models grid.
  .grid.gap-2.p-3(class="lg:grid-cols-2 xl:grid-cols-3")
    WellKnownModel.rounded-lg.bg-white.shadow-lg(
      v-for="(recommended,) in allModels?.wellKnown"
      v-bind="recommended"
      :base-path="modelsDirectoryRef"
      :key="recommended.recommendationModel.name"
      :show-uncached-quants="true"
      @select="(quantId) => selectModel(recommended.cachedModelsByQuants[quantId].model)"
      @remove="(quantId, deleteFile) => removeModel(recommended.cachedModelsByQuants[quantId].model.path, deleteFile)"
      @download-complete="() => refresh()"
    )

  //- Settings.
  .p-3(v-if="driverConfig?.type === 'local' && selectedModel")
    .grid.gap-2.rounded-lg.bg-white.p-3.shadow-lg( class="xl:grid-cols-2")
      //- Context size.
      RichInput#context-size(
        title="Context size"
        v-model="driverConfig.contextSize"
      )
        template(#icon)
          Settings2Icon(:size="16")
        NumberInputWithDefault.input.input-md.shrink-0.rounded-lg.border.px-2.py-1.text-sm#context-size(
          v-model="driverConfig.contextSize"
          :max="selectedModel.contextSize"
        )

      //- Batch size.
      RichInput#batch-size(
        title="Batch size"
        v-model="driverConfig.batchSize"
      )
        template(#icon)
          Settings2Icon(:size="16")
        NumberInputWithDefault.input.input-md.shrink-0.rounded-lg.border.px-2.py-1.text-sm#batch-size(
          v-model="driverConfig.batchSize"
        )

      //- Cache.
      RichInput#state-cache(
        v-if="hasCache"
        title="State cache"
      )
        template(#icon)
          DatabaseZapIcon(:size="16")
        .flex.shrink-0.items-center.gap-2
          template(v-if="cacheFiles.length")
            span.text-sm {{ prettyBytes( cacheFiles.reduce((acc, file) => acc + file.size, 0)) }}
            button.btn-pressable.btn.btn-sm-square.border.rounded-lg.bg-white(
              @click="clearStateCache"
              title="Clear state cache"
            )
              Icon(:iconNode="broom" name="broom" :size='16')
          span.text-sm.opacity-50(v-else) Empty
</template>

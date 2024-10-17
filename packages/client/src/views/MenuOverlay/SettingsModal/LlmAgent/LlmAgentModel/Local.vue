<script setup lang="ts">
import NumberInputWithDefault from "@/components/RichForm/NumberInputWithDefault.vue";
import RichInput from "@/components/RichForm/RichInput.vue";
import type { Download } from "@/lib/downloads";
import { downloadManager } from "@/lib/downloads";
import * as resources from "@/lib/resources";
import * as storage from "@/lib/storage";
import * as tauri from "@/lib/tauri";
import { omit } from "@/lib/utils";
import type { WellKnownModel } from "@/queries";
import { broom } from "@lucide/lab";
import * as tauriPath from "@tauri-apps/api/path";
import * as tauriDialog from "@tauri-apps/plugin-dialog";
import * as tauriFs from "@tauri-apps/plugin-fs";
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
import type { ShallowRef } from "vue";
import { computed, onMounted, ref, shallowRef, triggerRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import CustomModel from "./Local/CustomModel.vue";
import WellKnownModelVue from "./Local/WellKnownModel.vue";
import { type WellKnownModelProps } from "./Local/_common";

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

const availableModels = asyncComputed<Record<string, WellKnownModel>>(() =>
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
        await tauriPath.join(
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

  await tauriFs.mkdir(modelsDir, {
    baseDir: tauriFs.BaseDirectory.AppLocalData,
    recursive: true,
  });

  const entries = await tauriFs.readDir(modelsDir, {
    baseDir: tauriFs.BaseDirectory.AppLocalData,
  });

  // Remove custom models that no longer exist.
  const customModelEntries: (tauriFs.DirEntry | null)[] = await Promise.all(
    customModelsStorage.value.map(async (modelPath) => {
      if (await tauriFs.exists(modelPath)) {
        return {
          name: await tauriPath.basename(modelPath),
          isDirectory: false,
          isFile: true,
          isSymlink: false,
        } satisfies tauriFs.DirEntry;
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

    if (entry.isDirectory) {
      console.log(`${entry.name} is a directory, skipping`);
      continue;
    }

    const entryPath = await tauriPath.join(modelsDir, entry.name);

    let cachedModel = storage.llm.getCachedModel(entryPath);
    const stat = await tauriFs.stat(entryPath);

    if (cachedModel) {
      if (stat.mtime?.getTime() !== cachedModel.modifiedAt) {
        console.log(`Cached model ${entryPath} is outdated`);
        cachedModel = null;
      }
    }

    if (!cachedModel) {
      uncachedModels.value.push(entryPath);
      triggerRef(uncachedModels);

      try {
        cachedModel = await cacheModel(entryPath, stat);
      } catch (e: any) {
        console.error(`Failed to cache model ${entryPath}`, e);
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
    const cacheDir = await tauriPath.join(
      await tauri.resolveBaseDir(tauriFs.BaseDirectory.AppCache),
      props.agentId,
    );

    // Create the cache dir if it doesn't exist.
    await tauriFs.mkdir(cacheDir, { recursive: true });

    const entries = await tauriFs.readDir(cacheDir);

    for (const entry of entries) {
      const entryPath = await tauriPath.join(cacheDir, entry.name);

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

      if (entry.isDirectory) {
        console.log(`${entry.name} is a directory, skipping`);
        continue;
      }

      cacheFiles.value.push({
        path: entryPath,
        size: (await tauriFs.stat(entryPath)).size,
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

  const cacheDir = await tauriPath.join(
    await tauri.resolveBaseDir(tauriFs.BaseDirectory.AppCache),
    props.agentId,
  );

  const entries = await tauriFs.readDir(cacheDir);

  for (const entry of entries) {
    const entryPath = await tauriPath.join(cacheDir, entry.name);
    console.log("Removing cache entry", entryPath);
    await tauriFs.remove(entryPath);
  }

  cacheFiles.value = [];
}

async function cacheModel(modelPath: string, stat?: tauriFs.FileInfo) {
  console.log(`Caching model ${modelPath}`);

  const loadedModel = await tauri.gpt.loadModel(modelPath);
  console.debug("Model loaded", loadedModel);

  const xx64HashPromise = tauri.gpt.getModelHashByPath(modelPath);
  const sha256HashPromise = tauri.utils.fileSha256(modelPath, true);

  stat ||= await tauriFs.stat(modelPath);

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
    modifiedAt: stat.mtime?.getTime() ?? 0,
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
  const modelPath = await tauriDialog.open({
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
      refresh();
    } catch (e: any) {
      console.error(`Failed to cache model ${modelPath}`, e);
    } finally {
      uncachedModels.value.pop();
    }
  }
}

async function modelsDirectory() {
  const baseDir = await tauri.resolveBaseDir(
    tauriFs.BaseDirectory.AppLocalData,
  );
  return await tauriPath.join(baseDir, "models", props.agentId);
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
        ? t(
            "settings.llmAgentModel.local.removeConfirmation.deleteFile.message",
          )
        : t(
            "settings.llmAgentModel.local.removeConfirmation.removeFromList.message",
          ),
      {
        title: deleteFile
          ? t(
              "settings.llmAgentModel.local.removeConfirmation.deleteFile.title",
            )
          : t(
              "settings.llmAgentModel.local.removeConfirmation.removeFromList.title",
            ),
        okLabel: deleteFile
          ? t(
              "settings.llmAgentModel.local.removeConfirmation.deleteFile.okLabel",
            )
          : t(
              "settings.llmAgentModel.local.removeConfirmation.removeFromList.okLabel",
            ),
        cancelLabel: deleteFile
          ? t(
              "settings.llmAgentModel.local.removeConfirmation.deleteFile.cancelLabel",
            )
          : t(
              "settings.llmAgentModel.local.removeConfirmation.removeFromList.cancelLabel",
            ),
        kind: "warning",
      },
    ))
  ) {
    console.log("Cancelled delete", modelPath);
    return;
  }

  if (modelPath.startsWith(modelsDirectoryRef.value)) {
    console.log(`Deleting model file ${modelPath}`);
    await tauriFs.remove(modelPath);
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

const { t } = useI18n({
  messages: {
    "en-US": {
      settings: {
        llmAgentModel: {
          local: {
            addFromFileButton: {
              title: "Add model from file",
              label: "Add from file",
            },
            openDirectoryButton: {
              title: "Open the models directory",
              label: "Open directory",
            },
            refreshButton: {
              title: "Refresh",
              label: "Refresh",
            },
            contextSize: "Context size",
            batchSize: "Batch size",
            stateCache: "State cache",
            clearStateCacheButton: {
              title: "Clear state cache",
              label: "Clear",
            },
            emptyCache: "Empty",
            removeConfirmation: {
              deleteFile: {
                message:
                  "Are you sure you want to remove this model? The model file will be deleted.",
                title: "Delete model file?",
                okLabel: "Delete",
                cancelLabel: "Cancel",
              },
              removeFromList: {
                message:
                  "Are you sure you want to remove this model from the list?",
                title: "Remove model?",
                okLabel: "Remove",
                cancelLabel: "Cancel",
              },
            },
          },
        },
      },
    },
    "ru-RU": {
      settings: {
        llmAgentModel: {
          local: {
            addFromFileButton: {
              title: "Добавить модель из файла",
              label: "Добавить из файла",
            },
            openDirectoryButton: {
              title: "Открыть папку моделей",
              label: "Открыть папку",
            },
            refreshButton: {
              title: "Обновить список моделей",
              label: "Обновить",
            },
            contextSize: "Размер контекста",
            batchSize: "Размер батча",
            stateCache: "Кэш состояния",
            clearStateCacheButton: {
              title: "Очистить кэш состояния",
              label: "Очистить",
            },
            emptyCache: "Пусто",
            removeConfirmation: {
              deleteFile: {
                message:
                  "Вы уверены, что хотите удалить эту модель? Файл модели будет удален.",
                title: "Удалить файл модели?",
                okLabel: "Удалить",
                cancelLabel: "Отмена",
              },
              removeFromList: {
                message:
                  "Вы уверены, что хотите убрать эту модель из списка? Файл модели не будет удален.",
                title: "Убрать модель?",
                okLabel: "Убрать",
                cancelLabel: "Отмена",
              },
            },
          },
        },
      },
    },
  },
});
</script>

<template lang="pug">
.flex.flex-col.divide-y(v-if="modelsDirectoryRef")
  //- Actions header.
  .flex.col-span-full.gap-2.items-center.p-3
    button.shrink-0.btn-pressable.bg-white.btn.btn-sm.rounded-lg.border(
      @click="openLocalModelSelectionDialog"
      :title="t('settings.llmAgentModel.local.addFromFileButton.title')"
    )
      FileIcon(:size="18")
      span {{ t("settings.llmAgentModel.local.addFromFileButton.label") }}

    button.shrink-0.btn-pressable.bg-white.btn.btn-sm.rounded-lg.border(
      @click="openModelsDirectory"
      :title="t('settings.llmAgentModel.local.openDirectoryButton.title')"
    )
      FolderOpenIcon(:size="18")
      span {{ t("settings.llmAgentModel.local.openDirectoryButton.label") }}

    .w-full.border-b

    button.group.shrink-0.btn.btn-pressable.bg-white.btn-sm.rounded-lg.border(
      @click="refresh"
      :title="t('settings.llmAgentModel.local.refreshButton.title')"
    )
      RefreshCwIcon.transition(:size="18")
      span {{ t("settings.llmAgentModel.local.refreshButton.label") }}

  //- Models grid.
  .grid.gap-2.p-3(class="lg:grid-cols-2 xl:grid-cols-3")
    WellKnownModelVue.rounded-lg.bg-white.shadow-lg(
      v-for="(recommended,) in allModels?.wellKnown"
      v-bind="recommended"
      :base-path="modelsDirectoryRef"
      :key="recommended.recommendationModel.name"
      :show-uncached-quants="true"
      @select="(quantId) => selectModel(recommended.cachedModelsByQuants[quantId].model)"
      @remove="(quantId, deleteFile) => removeModel(recommended.cachedModelsByQuants[quantId].model.path, deleteFile)"
      @download-complete="() => refresh()"
    )

    //- Custom models.
    CustomModel.rounded-lg.bg-white.shadow-lg(
      v-for="customModel in allModels?.custom"
      :key="customModel.path"
      :model="customModel"
      :selected="selectedModelPath === customModel.path"
      @select="() => selectModel(customModel)"
      @remove="removeModel(customModel.path, false)"
    )

  //- Settings.
  .p-3(v-if="driverConfig?.type === 'local' && selectedModel")
    .grid.gap-2.rounded-lg.bg-white.p-3.shadow-lg( class="xl:grid-cols-2")
      //- Context size.
      RichInput#context-size(
        :title="t('settings.llmAgentModel.local.contextSize')"
        v-model="driverConfig.contextSize"
      )
        template(#icon)
          Settings2Icon(:size="16")
        NumberInputWithDefault.input.input-md.shrink-0.rounded-lg.border.px-2.py-1.text-sm#context-size(
          v-model="driverConfig.contextSize"
          :max="selectedModel.contextSize"
        )

      slot(
          name="context-size-help"
          :context-size="driverConfig.contextSize"
          :max-context-size="selectedModel.contextSize"
        )

      //- Batch size.
      RichInput#batch-size(
        :title="t('settings.llmAgentModel.local.batchSize')"
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
        :title="t('settings.llmAgentModel.local.stateCache')"
      )
        template(#icon)
          DatabaseZapIcon(:size="16")
        .flex.shrink-0.items-center.gap-2
          template(v-if="cacheFiles.length")
            span.text-sm {{ prettyBytes( cacheFiles.reduce((acc, file) => acc + file.size, 0)) }}
            button.btn-pressable.btn.btn-sm-square.border.rounded-lg.bg-white(
              @click="clearStateCache"
              :title="t('settings.llmAgentModel.local.clearStateCacheButton.title')"
            )
              Icon(:iconNode="broom" name="broom" :size='16')
          span.text-sm.opacity-50(v-else) {{ t("settings.llmAgentModel.local.emptyCache") }}
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import * as dialog from "@tauri-apps/api/dialog";
import {
  FolderOpenIcon,
  GlobeIcon,
  HardDriveIcon,
  SaveIcon,
} from "lucide-vue-next";
import * as tauri from "@/lib/tauri";
import * as settings from "@/settings";
import { unreachable } from "@/lib/utils";

const driver = ref<"remote" | "local">("remote");
watch(driver, async (newDriver) => {
  switch (newDriver) {
    case "remote": {
      await settings.setGptDriver(newDriver);
      await settings.save();
      break;
    }

    case "local": {
      if (localModelPath.value) {
        await settings.setGptDriver(newDriver);
        await settings.save();
      }

      break;
    }

    default:
      throw unreachable(newDriver);
  }
});

const remoteBaseUrl = ref<string | null>(
  import.meta.env.VITE_DEFAULT_REMOTE_INFERENCE_SERVER_BASE_URL,
);
const remoteBaseUrlSaved = ref<string | null>(
  import.meta.env.VITE_DEFAULT_REMOTE_INFERENCE_SERVER_BASE_URL,
);
const canSaveRemote = computed(
  () => remoteBaseUrl.value && remoteBaseUrl.value !== remoteBaseUrlSaved.value,
);

const localModelPath = ref<string | null>(null);
const localModelPathSaved = ref<string | null>(null);
const localModelContextSize = ref<number | null>(null);
const localModelContextSizeSaved = ref<number | null>(null);
const canSaveLocal = computed(
  () =>
    localModelPath.value !== localModelPathSaved.value &&
    localModelContextSize.value !== localModelContextSizeSaved.value,
);

async function openLocalModelSelectionDialog() {
  const modelPath = await dialog.open({
    filters: [{ extensions: ["gguf"], name: "GGUF" }],
    multiple: false,
    title: "Select a local model file",
  });

  if (typeof modelPath === "string") {
    localModelPath.value = modelPath;
    const model = await tauri.gpt.loadModel(modelPath);
    await settings.setGptLocalModelPath(modelPath);

    // TODO: Set the context size manually.
    localModelContextSize.value = model.trainContextSize;
    await settings.setGptLocalContextSize(model.trainContextSize);
  }
}

async function saveRemote() {
  await settings.setGptDriver("remote");
  await settings.setGptRemoteBaseUrl(remoteBaseUrl.value!);
  await settings.save();
  remoteBaseUrlSaved.value = remoteBaseUrl.value;
}

async function saveLocal() {
  await settings.setGptDriver("local");
  await settings.setGptLocalModelPath(localModelPath.value!);
  await settings.setGptLocalContextSize(localModelContextSize.value!);
  await settings.save();
  localModelPathSaved.value = localModelPath.value;
  localModelContextSizeSaved.value = localModelContextSize.value;
}

onMounted(async () => {
  const setDriver = await settings.getGptDriver();

  switch (setDriver) {
    case "local": {
      driver.value = setDriver;
      localModelPath.value = await settings.getGptLocalModelPath();

      if (localModelPath.value) {
        const model = await tauri.gpt.loadModel(localModelPath.value);
        localModelContextSize.value = model.trainContextSize;
      }

      break;
    }

    case "remote": {
      driver.value = setDriver;
      remoteBaseUrl.value = await settings.getGptRemoteBaseUrl();
      break;
    }

    case null:
      break;

    default:
      throw unreachable(setDriver);
  }
});
</script>

<template lang="pug">
.flex.flex-col.gap-2.p-3
  h1.text-lg.font-semibold.leading-tight.tracking-wide Settings
  h2.font-medium.leading-tight.tracking-wide Text inference

  //- Inference driver tabs.
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

  //- Remote inference.
  .grid.w-full.gap-2(
    v-if="driver === 'remote'"
    style="grid-template-columns: max-content auto"
  )
    .flex.items-center
      span.whitespace-nowrap.font-semibold Base URL
    input.input.w-full.rounded-lg.border.p-1(v-model="remoteBaseUrl")
    button.btn.btn-md.btn-primary.col-span-full.rounded-lg.transition-transform.pressable(
      @click="saveRemote"
      :disabled="!canSaveRemote"
    )
      SaveIcon(:size="20")
      span Save

  //- Local inference.
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
      span.whitespace-nowrap.font-semibold Context size
    .flex.items-center
      span {{ localModelContextSize === undefined ? "Unknown" : localModelContextSize }}

    button.btn.btn-md.btn-primary.col-span-full.rounded-lg.transition-transform.pressable(
      @click="saveLocal"
      :disabled="!canSaveLocal"
    )
      SaveIcon(:size="20")
      span Save
</template>

<script setup lang="ts">
import type { LlmAgentId } from "@/lib/storage/llm";
import {
  Dialog,
  DialogPanel,
  TransitionChild,
  TransitionRoot,
} from "@headlessui/vue";
import { DownloadCloudIcon, XIcon } from "lucide-vue-next";
import { shallowRef } from "vue";
import { onMounted } from "vue";
import Model, { type LlmModelRecommedation } from "./DownloadModal/Model.vue";
import Alert from "@/components/Alert.vue";
import * as tauri from "@/lib/tauri";
import * as fs from "@tauri-apps/api/fs";
import * as path from "@tauri-apps/api/path";
import { asyncComputed } from "@vueuse/core";

const { agentId } = defineProps<{
  open: boolean;
  agentId: LlmAgentId;
}>();

const emit = defineEmits<{
  (event: "close"): void;
}>();

const onClose = () => {
  emit("close");
};

const models = shallowRef<LlmModelRecommedation[]>([]);

async function modelsDirectory() {
  const baseDir = await tauri.resolveBaseDir(fs.BaseDirectory.AppLocalData);
  return await path.join(baseDir, "models", agentId);
}

const modelsDirectoryRef = asyncComputed(modelsDirectory);

async function openModelsDirectory() {
  await tauri.utils.fileManagerOpen(await modelsDirectory());
}

onMounted(async () => {
  models.value = (
    await fetch("/model_recommendations.json").then((res) => res.json())
  ).filter(
    (model: any) => model.type === "llm" && model.task === agentId,
  ) as LlmModelRecommedation[];
});
</script>

<template lang="pug">
Dialog.relative.z-50.w-screen.overflow-hidden(
  :open="open"
  @close="onClose"
  :unmount="false"
  :static="true"
)
  TransitionRoot(:show="open" as="template")
    TransitionChild.fixed.inset-0.grid.place-items-center.overflow-hidden.p-4.backdrop-blur(
      class="bg-black/30"
      enter="duration-200 ease-out"
      enter-from="opacity-0"
      enter-to="opacity-100"
      leave="duration-200 ease-in"
      leave-from="opacity-100"
      leave-to="opacity-0"
    )
      DialogPanel.flex.w-full.max-w-xl.flex-col.overflow-y-hidden.rounded-xl.bg-white.shadow-lg
        .flex.items-center.justify-between.gap-2.border-b.p-3
          h1.flex.shrink-0.items-center.gap-1
            DownloadCloudIcon.inline-block(:size="20")
            span.text-lg.font-semibold.leading-tight.tracking-wide Download models
          .h-0.w-full.shrink.border-b
          button.btn-pressable.btn-neutral.btn.aspect-square.rounded.p-1(
            @click="onClose"
          )
            XIcon(:size="20")

        .flex.flex-col.gap-2.p-3
          Alert(type="info")
            | One-click model download is not implemented yet.
            | For now, clicking a download button opens a browser.
            | Save downloaded models to
            |
            span.break-all.font-mono {{ modelsDirectoryRef }}/
            |
            | (
            button.link(
              @click="openModelsDirectory"
              :disabled="!modelsDirectoryRef"
            )
              | open in file manager
            | ).
          Model.rounded-lg.border(v-for="model in models" :model)
</template>

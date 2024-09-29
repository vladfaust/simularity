<script lang="ts">
export type AvailableModel = {
  name: string;
  description: string;
  nParams: number;
  contextSize: number;
  hfUrl?: string;
  quants: Record<
    string,
    {
      hash: {
        sha256: string;
      };
      ramSize: number;
      urls: {
        hf: string;
      };
    }
  >;
};

export type WellKnownModelProps = {
  recommendationModelId: string;
  recommendationModel: AvailableModel;
  cachedModelsByQuants: Record<
    string,
    {
      model: storage.llm.CachedModel;
      selected: Ref<boolean>;
      removeDeletesFile: boolean;
    }
  >;
  downloadsByQuant: ShallowRef<Record<string, ShallowRef<Download>>>;
};
</script>

<script setup lang="ts">
import CustomTitle from "@/components/CustomTitle.vue";
import { Download, downloadManager } from "@/lib/downloads";
import * as storage from "@/lib/storage";
import * as tauri from "@/lib/tauri";
import { prettyNumber } from "@/lib/utils";
import { path, shell } from "@tauri-apps/api";
import {
  BanIcon,
  BrainCogIcon,
  ChevronDownIcon,
  CircleMinusIcon,
  FolderOpenIcon,
  LoaderCircleIcon,
  PauseIcon,
  PlayIcon,
  ProportionsIcon,
} from "lucide-vue-next";
import prettyBytes from "pretty-bytes";
import type { ShallowRef } from "vue";
import { computed, ref, shallowRef, triggerRef, type Ref } from "vue";

const WELL_KNOWN_QUANTS: Record<
  string,
  {
    name: string;
    help?: string;
  }
> = {
  q3km: {
    name: "Q3_K_M",
    help: "Very small, high quality loss.",
  },
  q4km: {
    name: "Q4_K_M",
    help: "Medium, balanced quality.",
  },
  q5km: {
    name: "Q5_K_M",
    help: "Large, very low quality loss.",
  },
  q6k: {
    name: "Q6_K",
    help: "Very large, extremely low quality loss.",
  },
};

const props = defineProps<
  WellKnownModelProps & {
    showUncachedQuants?: boolean;
    basePath: string;
  }
>();

const emit = defineEmits<{
  (event: "remove", quantId: string, deleteFile: boolean): void;
  (event: "select", quantId: string): void;
}>();

const showAllQuants = ref(false);

/**
 * If `showAllQuants` is true, show all quants.
 * Otherwise, show either the quants that are cached or the first quant.
 * Always show downloaded quants.
 */
const shownQuants = computed(() => {
  const shown = Object.entries(props.recommendationModel.quants).filter(
    ([quantId, _]) => {
      if (props.showUncachedQuants && showAllQuants.value) {
        return true;
      } else {
        const isCached = quantId in props.cachedModelsByQuants;
        const isDownloaded = quantId in props.downloadsByQuant.value;
        return isCached || isDownloaded || showAllQuants.value;
      }
    },
  );

  return Object.fromEntries(
    shown.length
      ? shown
      : Object.entries(props.recommendationModel.quants).slice(0, 1),
  );
});

function openHfUrl() {
  if (!props.recommendationModel.hfUrl) return;
  shell.open(props.recommendationModel.hfUrl);
}

/**
 * Create new download for the quant.
 */
async function createDownload(quantId: string) {
  const quant = props.recommendationModel.quants[quantId];

  const id = `${props.recommendationModelId}.${quantId}`;
  const downloadPath = await path.join(props.basePath, `${id}.download`);

  const download = await downloadManager.create(downloadPath, [
    {
      targetPath: await path.join(props.basePath, `${id}.gguf`),
      url: quant.urls.hf,
      hashes: {
        sha256: quant.hash.sha256,
      },
    },
  ]);

  props.downloadsByQuant.value[quantId] = shallowRef(download);
  triggerRef(props.downloadsByQuant);
}

/**
 * Cancel an existing download for the quant.
 */
async function cancelDownload(quantId: string) {
  console.log("Cancelling download for quant", quantId);

  const download = props.downloadsByQuant.value[quantId].value;
  if (!download) throw new Error(`No download found for quant ${quantId}`);

  delete props.downloadsByQuant.value[quantId];
  triggerRef(props.downloadsByQuant);

  await download.destroy();
}

async function showInFileManager(quantId: string) {
  const cachedModel = props.cachedModelsByQuants[quantId];
  await tauri.utils.fileManagerOpen(cachedModel.model.path);
}
</script>

<template lang="pug">
li.flex.flex-col.divide-y
  .flex.flex-col.p-3
    CustomTitle(:title="recommendationModel.name")
      template(#extra v-if="recommendationModel.hfUrl")
        button.btn-pressable(@click="openHfUrl") 🤗

    p.text-sm.leading-snug {{ recommendationModel.description }}

    //- Params.
    .mt-1.flex.flex-wrap.items-center.gap-x-2.text-sm
      //- nParams.
      .flex.gap-1
        BrainCogIcon.self-center(:size="18" :stroke-width="2.5")
        .flex.gap-1
          span.font-semibold Params:
          span {{ prettyNumber(recommendationModel.nParams, { space: false }) }}p

      //- Context size.
      .flex.gap-1
        ProportionsIcon.self-center(:size="18" :stroke-width="2.5")
        .flex.gap-1
          span.font-semibold Context:
          span {{ prettyNumber(recommendationModel.contextSize, { space: false }) }}t

  //- Quants.
  .grid.gap-2.p-3(
    style="grid-template-columns: 6rem repeat(2, min-content) auto"
  )
    template(v-for="[quantId, quant] in Object.entries(shownQuants)")
      //- Select button.
      button.btn.btn-pressable.btn-neutral.btn-sm.rounded(
        v-if="cachedModelsByQuants[quantId]"
        :class="{ 'btn-primary': cachedModelsByQuants[quantId].selected.value, 'btn-neutral': !cachedModelsByQuants[quantId].selected.value }"
        @click="emit('select', quantId)"
      )
        template(v-if="cachedModelsByQuants[quantId].selected.value")
          | Selected
        template(v-else)
          | Select

      //- Download progress.
      .btn.btn-sm.rounded.border(v-else-if="downloadsByQuant.value[quantId]")
        LoaderCircleIcon.animate-spin(
          :size="18"
          v-if="!downloadsByQuant.value[quantId].value.paused.value"
        )
        | {{ Math.round(downloadsByQuant.value[quantId].value.progress.value * 100) }}%

      //- Download button.
      button.btn.btn-pressable.btn-neutral.btn-sm.rounded(
        v-else
        @click="createDownload(quantId)"
      )
        | Download

      .flex.items-center.justify-center
        span.text-sm.leading-none(
          v-tooltip="WELL_KNOWN_QUANTS[quantId]?.help"
          :class="{ 'cursor-help underline decoration-dotted': WELL_KNOWN_QUANTS[quantId]?.help }"
        ) {{ WELL_KNOWN_QUANTS[quantId]?.name || quantId }}

      .flex.items-center
        span.cursor-help.rounded.border.px-1.text-xs.leading-none(
          v-if="downloadsByQuant.value[quantId]"
          class="py-0.5"
          v-tooltip="`${prettyBytes(downloadsByQuant.value[quantId].value.averageSpeed.value ?? 0, { space: true, binary: true })}/s`"
        )
          | {{ prettyBytes(downloadsByQuant.value[quantId].value.totalFileSize.value, { space: false, binary: false }) }}
        span.rounded.border.px-1.text-xs.leading-none(v-else class="py-0.5")
          | {{ prettyBytes(cachedModelsByQuants[quantId]?.model.ramSize ?? quant.ramSize, { space: false, binary: false }) }}

      //- Actions.
      //- When the quant is cached.
      .flex.items-center.gap-2(v-if="cachedModelsByQuants[quantId]")
        .w-full.border-b
        .flex.items-center.gap-1
          //- Open in file manager.
          button.btn.btn-pressable(
            title="Open in file manager"
            @click="showInFileManager(quantId)"
          )
            FolderOpenIcon(:size="18")

          //- Remove.
          button.btn.btn-pressable(
            class="hover:text-error-500"
            :title="cachedModelsByQuants[quantId].removeDeletesFile ? 'Delete model file' : 'Remove model from list'"
            @click="emit('remove', quantId, cachedModelsByQuants[quantId].removeDeletesFile)"
          )
            CircleMinusIcon(:size="18")

      //- When the quant is being downloaded.
      .flex.items-center.gap-2(v-else-if="downloadsByQuant.value[quantId]")
        .w-full.border-b
        .flex.items-center.gap-1
          //- Resume.
          button.btn.btn-pressable(
            v-if="downloadsByQuant.value[quantId].value.paused.value"
            title="Resume download"
            @click="downloadsByQuant.value[quantId].value.resume()"
          )
            PlayIcon(:size="18")

          //- Pause.
          button.btn.btn-pressable(
            v-else
            title="Pause download"
            @click="downloadsByQuant.value[quantId].value.pause()"
          )
            PauseIcon(:size="18")

          //- Cancel.
          button.btn.btn-pressable(
            title="Cancel download"
            @click="cancelDownload(quantId)"
          )
            BanIcon(:size="18")

      .flex(v-else)

    button.btn.col-span-full.gap-1.rounded.border.bg-neutral-100.px-2.text-sm.font-semibold.transition.pressable-sm(
      class="py-1.5"
      v-if="(Object.keys(recommendationModel.quants).length > Object.keys(shownQuants).length && showUncachedQuants) || showAllQuants"
      @click="showAllQuants = !showAllQuants"
    )
      ChevronDownIcon(:size="18" :class="{ 'rotate-180': showAllQuants }")
      span Show
      span(v-if="showAllQuants") less
      span(v-else) more
</template>

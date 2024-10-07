<script lang="ts">
export type WellKnownModelProps = {
  recommendationModelId: string;
  recommendationModel: WellKnownModel;
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
import RichTitle from "@/components/RichForm/RichTitle.vue";
import { Download, downloadManager } from "@/lib/downloads";
import * as storage from "@/lib/storage";
import * as tauri from "@/lib/tauri";
import { prettyNumber } from "@/lib/utils";
import { SUPPORTED_LOCALES } from "@/logic/i18n";
import type { WellKnownModel } from "@/queries";
import { path, shell } from "@tauri-apps/api";
import {
  BanIcon,
  BrainCogIcon,
  ChevronDownIcon,
  CircleMinusIcon,
  FolderOpenIcon,
  LanguagesIcon,
  LoaderCircleIcon,
  PauseIcon,
  PlayIcon,
  ProportionsIcon,
} from "lucide-vue-next";
import prettyBytes from "pretty-bytes";
import type { ShallowRef } from "vue";
import { computed, ref, shallowRef, triggerRef, type Ref } from "vue";
import { useI18n } from "vue-i18n";

const WELL_KNOWN_QUANTS: Record<string, string> = {
  q3km: "Q3_K_M",
  q4km: "Q4_K_M",
  q5km: "Q5_K_M",
  q6k: "Q6_K",
  q8: "Q8",
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
  (event: "downloadComplete", quantId: string): void;
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

  download.onComplete(() => {
    console.log("Download complete for quant", quantId);
    emit("downloadComplete", quantId);
  });
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

const { t } = useI18n({
  messages: {
    "en-US": {
      settings: {
        llmAgentModel: {
          local: {
            wellKnownModel: {
              wellKnownQuants: {
                q3km: {
                  help: "Very small size, high quality loss",
                },
                q4km: {
                  help: "Medium size, balanced quality",
                },
                q5km: {
                  help: "Large size, very low quality loss",
                },
                q6k: {
                  help: "Very large size, extremely low quality loss",
                },
                q8: {
                  help: "Largest size, lossless",
                },
              },
              params: {
                label: "Params",
                tooltip:
                  "Number of model parameters. The higher, the more smart the model is",
              },
              contextSize: {
                label: "Ctx",
                tooltip: "Maximum context size for a this model",
              },
              locales: {
                label: "Lang",
                tooltip: "Languages the model has been trained on",
              },
              selected: "Selected",
              select: "Select",
              download: "Download",
              openInFileManagerButton: {
                title: "Open in file manager",
              },
              remove: {
                button: {
                  titleRemoveFromList: "Remove model from list",
                  titleDeleteFile: "Delete model file",
                },
              },
              resumeDownloadButton: {
                title: "Resume download",
              },
              pauseDownloadButton: {
                title: "Pause download",
              },
              cancelDownloadButton: {
                title: "Cancel download",
              },
              show: {
                less: "Show less",
                more: "Show more",
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
            wellKnownModel: {
              wellKnownQuants: {
                q3km: {
                  help: "Очень маленький размер, большое снижение качества модели",
                },
                q4km: {
                  help: "Средний размер, сбалансированное качество модели",
                },
                q5km: {
                  help: "Большой размер, небольшое снижение качества модели",
                },
                q6k: {
                  help: "Очень большой размер, крайне небольшое снижение качества модели",
                },
                q8: {
                  help: "Самый большой размер, без потерь в качестве модели",
                },
              },
              params: {
                label: "Параметры",
                tooltip:
                  "Количество параметров модели. Чем больше, тем умнее модель",
              },
              contextSize: {
                label: "Контекст",
                tooltip: "Максимальный размер контекста для этой модели",
              },
              locales: {
                label: "Языки",
                tooltip: "Языки, на которых обучена модель",
              },
              selected: "Выбрано",
              select: "Выбрать",
              download: "Скачать",
              openInFileManagerButton: {
                title: "Открыть в файловом менеджере",
              },
              remove: {
                button: {
                  titleRemoveFromList: "Удалить модель из списка",
                  titleDeleteFile: "Удалить файл модели",
                },
              },
              resumeDownloadButton: {
                title: "Продолжить скачивание",
              },
              pauseDownloadButton: {
                title: "Приостановить скачивание",
              },
              cancelDownloadButton: {
                title: "Отменить скачивание",
              },
              show: {
                less: "Показать меньше",
                more: "Показать больше",
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
li.flex.flex-col.divide-y
  .flex.flex-col.p-3
    RichTitle(:title="recommendationModel.name")
      template(#extra v-if="recommendationModel.hfUrl")
        button.btn-pressable(@click="openHfUrl") 🤗

    p.text-sm.leading-snug.opacity-80 {{ recommendationModel.description }}

    //- Params.
    .mt-1.flex.flex-wrap.items-center.gap-x-2.text-sm
      //- nParams.
      .flex.cursor-help.gap-1(
        v-tooltip="t('settings.llmAgentModel.local.wellKnownModel.params.tooltip')"
      )
        BrainCogIcon.self-center(:size="18" :stroke-width="2.5")
        .flex.gap-1
          span.font-semibold {{ t("settings.llmAgentModel.local.wellKnownModel.params.label") }}:
          span {{ prettyNumber(recommendationModel.nParams, { space: false }) }}p

      //- Context size.
      .flex.cursor-help.gap-1(
        v-tooltip="t('settings.llmAgentModel.local.wellKnownModel.contextSize.tooltip')"
      )
        ProportionsIcon.self-center(:size="18" :stroke-width="2.5")
        .flex.gap-1
          span.font-semibold {{ t("settings.llmAgentModel.local.wellKnownModel.contextSize.label") }}:
          span {{ prettyNumber(recommendationModel.contextSize, { space: false }) }}t

      //- Locales.
      .flex.cursor-help.gap-1(
        v-tooltip="t('settings.llmAgentModel.local.wellKnownModel.locales.tooltip')"
      )
        LanguagesIcon.self-center(:size="18" :stroke-width="2.5")
        .flex.gap-1
          span.font-semibold {{ t("settings.llmAgentModel.local.wellKnownModel.locales.label") }}:
          span {{ recommendationModel.locales.map((l) => SUPPORTED_LOCALES[l.toString()].label).join(", ") }}

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
          | {{ t("settings.llmAgentModel.local.wellKnownModel.selected") }}
        template(v-else)
          | {{ t("settings.llmAgentModel.local.wellKnownModel.select") }}

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
        | {{ t("settings.llmAgentModel.local.wellKnownModel.download") }}

      .flex.items-center.justify-center
        span.text-sm.leading-none(
          v-tooltip="WELL_KNOWN_QUANTS[quantId] ? t(`settings.llmAgentModel.local.wellKnownModel.wellKnownQuants.${quantId}.help`) : undefined"
          :class="{ 'cursor-help underline decoration-dotted': WELL_KNOWN_QUANTS[quantId] }"
        ) {{ WELL_KNOWN_QUANTS[quantId] ?? quantId }}

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
            :title="t('settings.llmAgentModel.local.wellKnownModel.openInFileManagerButton.title')"
            @click="showInFileManager(quantId)"
          )
            FolderOpenIcon(:size="18")

          //- Remove.
          button.btn.btn-pressable(
            class="hover:text-error-500"
            :title="cachedModelsByQuants[quantId].removeDeletesFile ? t('settings.llmAgentModel.local.wellKnownModel.remove.button.titleDeleteFile') : t('settings.llmAgentModel.local.wellKnownModel.remove.button.titleRemoveFromList')"
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
            :title="t('settings.llmAgentModel.local.wellKnownModel.resumeDownloadButton.title')"
            @click="downloadsByQuant.value[quantId].value.resume()"
          )
            PlayIcon(:size="18")

          //- Pause.
          button.btn.btn-pressable(
            v-else
            :title="t('settings.llmAgentModel.local.wellKnownModel.pauseDownloadButton.title')"
            @click="downloadsByQuant.value[quantId].value.pause()"
          )
            PauseIcon(:size="18")

          //- Cancel.
          button.btn.btn-pressable(
            :title="t('settings.llmAgentModel.local.wellKnownModel.cancelDownloadButton.title')"
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
      span(v-if="showAllQuants") {{ t("settings.llmAgentModel.local.wellKnownModel.show.less") }}
      span(v-else) {{ t("settings.llmAgentModel.local.wellKnownModel.show.more") }}
</template>

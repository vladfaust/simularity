<script setup lang="ts">
import CustomTitle from "@/components/RichForm/RichTitle.vue";
import * as storage from "@/lib/storage";
import * as tauri from "@/lib/tauri";
import { prettyNumber } from "@/lib/utils";
import * as path from "@tauri-apps/api/path";
import { asyncComputed } from "@vueuse/core";
import {
  BrainCogIcon,
  CircleMinusIcon,
  FolderOpenIcon,
  Loader2Icon,
  ProportionsIcon,
} from "lucide-vue-next";
import prettyBytes from "pretty-bytes";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps<{
  model: storage.llm.CachedModel | { path: string };
  selected: boolean;
}>();

const emit = defineEmits<{
  (event: "select"): void;
  (event: "remove"): void;
}>();

const name = asyncComputed(() => path.basename(props.model.path));
const cached = computed(() => "modelHash" in props.model);

async function showInFileManager() {
  await tauri.utils.fileManagerOpen(props.model.path);
}

const { t } = useI18n({
  messages: {
    "en-US": {
      settings: {
        llmAgentModel: {
          local: {
            customModel: {
              addedManually: "Model added manually.",
              params: {
                label: "Params",
                tooltip:
                  "Number of model parameters. The higher, the more smart the model is",
              },
              contextSize: {
                label: "Ctx",
                tooltip: "Maximum context size for a this model",
              },
              selected: "Selected",
              select: "Select",
              openInFileManagerButton: {
                title: "Open in file manager",
              },
              removeButton: {
                title: "Remove model from list",
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
            customModel: {
              addedManually: "Модель добавлена вручную.",
              params: {
                label: "Параметры",
                tooltip:
                  "Количество параметров модели. Чем больше, тем умнее модель",
              },
              contextSize: {
                label: "Контекст",
                tooltip: "Максимальный размер контекста для этой модели",
              },
              selected: "Выбрано",
              select: "Выбрать",
              openInFileManagerButton: {
                title: "Открыть в файловом менеджере",
              },
              removeButton: {
                title: "Удалить модель из списка",
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
.flex.flex-col.divide-y
  .flex.flex-col.overflow-x-hidden.p-3
    CustomTitle(:hide-border="true")
      .flex.w-full.items-center.gap-1.overflow-hidden
        span.overflow-x-hidden.text-nowrap.font-semibold.leading-snug.tracking-wide {{ name }}

    //- Description.
    p.text-sm.italic.leading-snug.opacity-80 {{ t("settings.llmAgentModel.local.customModel.addedManually") }}

    //- Params.
    .mt-1.flex.flex-wrap.items-center.gap-x-2.text-sm
      //- nParams.
      .flex.gap-1(
        v-tooltip="t('settings.llmAgentModel.local.customModel.params.tooltip')"
      )
        BrainCogIcon.self-center(:size="18" :stroke-width="2.5")
        .flex.gap-1
          span.font-semibold {{ t("settings.llmAgentModel.local.customModel.params.label") }}:
          span(v-if="'nParams' in model") {{ prettyNumber(model.nParams, { space: false }) }}p
          Loader2Icon.animate-spin.self-center(v-else :size="18")

      //- Context size.
      .flex.gap-1(
        v-tooltip="t('settings.llmAgentModel.local.customModel.contextSize.tooltip')"
      )
        ProportionsIcon.self-center(:size="18" :stroke-width="2.5")
        .flex.gap-1
          span.font-semibold {{ t("settings.llmAgentModel.local.customModel.contextSize.label") }}:
          span(v-if="'contextSize' in model") {{ prettyNumber(model.contextSize, { space: false }) }}t
          Loader2Icon.animate-spin.self-center(v-else :size="16")

  .grid.gap-2.p-3(style="grid-template-columns: 6rem min-content auto")
    //- Select button.
    button.btn.btn-pressable.btn-neutral.btn-sm.rounded(
      :class="{ 'btn-primary': selected, 'btn-neutral': !selected }"
      :disabled="!cached"
      @click="emit('select')"
    )
      template(v-if="selected") {{ t("settings.llmAgentModel.local.customModel.selected") }}
      template(v-else) {{ t("settings.llmAgentModel.local.customModel.select") }}

    .flex.items-center
      span.rounded.border.px-1.text-xs.leading-none(
        class="py-0.5"
        v-if="'ramSize' in model"
      )
        | {{ prettyBytes(model.ramSize, { space: false, binary: false }) }}
      Loader2Icon.animate-spin.self-center(v-else :size="18")

    //- Actions.
    .flex.items-center.gap-2
      .w-full.border-b

      .flex.items-center.gap-1
        //- Open in file manager.
        button.btn.btn-pressable(
          :title="t('settings.llmAgentModel.local.customModel.openInFileManagerButton.title')"
          @click="showInFileManager()"
        )
          FolderOpenIcon(:size="18")

        //- Remove.
        button.btn.btn-pressable(
          v-if="cached"
          class="hover:text-error-500"
          :title="t('settings.llmAgentModel.local.customModel.removeButton.title')"
          @click="emit('remove')"
        )
          CircleMinusIcon(:size="18")
</template>
